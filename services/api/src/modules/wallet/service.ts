import type { Prisma, PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../../core/redis.js';
import { FraudRiskEngine } from '../fraud/service.js';

const COINS_PER_IDR = 10n;
const MIN_WITHDRAWAL_IDR = 10_000n;
const CURRENCY = 'IDR';
const DAILY_CAPACITY_KEY = 'withdrawal_capacity';
const COUNTED_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'PROCESSING', 'PENDING_PROVIDER', 'COMPLETED', 'PENDING_CAPACITY'] as const;

type Tx = Prisma.TransactionClient;
type DecimalLike = { toFixed(dp?: number): string };
type Capacity = { max_wd_users_per_day: number; max_wd_transactions_per_day: number; max_payout_amount_per_day: bigint; max_wd_per_user_per_day: number; max_wd_amount_per_user_per_day: bigint; reset_time: string; enable_daily_limit: boolean };

export class WalletWithdrawalService {
  private readonly fraud: FraudRiskEngine;
  constructor(private readonly db: PrismaClient, redis: RedisConnection) { this.fraud = new FraudRiskEngine(db, redis); }
  async getWallet(appId: string, userId: string) { return this.db.$transaction(async (tx) => this.syncWalletInTransaction(tx, appId, userId)); }
  async listWithdrawals(appId: string, userId: string, history = false) { return this.db.withdrawals.findMany({ where: history ? { appId, userId } : { appId, userId, status: { in: COUNTED_STATUSES } }, orderBy: { createdAt: 'desc' }, take: 100 }); }
  async getWithdrawal(appId: string, userId: string, id: string) { const withdrawal = await this.db.withdrawals.findFirst({ where: { appId, userId, id } }); if (!withdrawal) throw error(404, 'WITHDRAWAL_NOT_FOUND', 'Withdrawal not found'); return withdrawal; }
  async requestWithdrawal(input: { appId: string; userId: string; sessionId: string; methodId: string; amount: bigint; idempotencyKey: string; ipAddress?: string; deviceId?: string }) {
    if (input.amount < MIN_WITHDRAWAL_IDR) throw error(400, 'WITHDRAWAL_BELOW_MINIMUM', 'Minimum withdrawal is Rp10.000');
    if (input.amount <= 0n) throw error(400, 'INVALID_WITHDRAWAL_AMOUNT', 'Withdrawal amount must be a positive whole IDR amount');
    if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 255) throw error(400, 'INVALID_IDEMPOTENCY_KEY', 'IdempotencyKey must be 8-255 characters');
    const existing = await this.db.withdrawals.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) { if (existing.appId !== input.appId || existing.userId !== input.userId || existing.withdrawalMethodId !== input.methodId || existing.amount.toFixed(0) !== input.amount.toString()) throw error(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for a different withdrawal'); return existing; }
    const method = await this.db.withdrawalMethods.findFirst({ where: { id: input.methodId, appId: input.appId, userId: input.userId, status: { in: ['ACTIVE', 'VERIFIED'] } } });
    if (!method) throw error(400, 'WITHDRAWAL_METHOD_INVALID', 'Withdrawal method is not active or verified');
    const session = await this.db.userSessions.findUnique({ where: { id: input.sessionId } });
    const risk = await this.fraud.assess({ appId: input.appId, userId: input.userId, sessionId: input.sessionId, deviceId: input.deviceId, ipAddress: input.ipAddress ?? session?.ipAddress ?? undefined, eventType: 'withdrawal' });
    const capacity = await this.loadCapacity(input.appId);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`withdrawal:${input.appId}`}, 0))`;
      const lockedAccounts = await tx.$queryRaw<Array<{ balance: bigint }>>`SELECT "balance" FROM "coin_accounts" WHERE "appId" = ${input.appId} AND "userId" = ${input.userId} FOR UPDATE`;
      const account = lockedAccounts[0]; if (!account) throw error(400, 'WALLET_NOT_INITIALIZED', 'Wallet has no coin account');
      const wallet = await tx.wallets.upsert({ where: { appId_userId: { appId: input.appId, userId: input.userId } }, create: { appId: input.appId, userId: input.userId, availableBalance: '0', lockedBalance: '0', currency: CURRENCY, version: 0n }, update: {} });
      const lockedBalance = BigInt(wallet.lockedBalance.toFixed(0)); const available = account.balance / COINS_PER_IDR - lockedBalance;
      if (available < input.amount) throw error(400, 'INSUFFICIENT_WALLET_BALANCE', 'Insufficient available wallet balance');
      if (capacity.enable_daily_limit) {
        const window = dailyWindow(capacity.reset_time);
        const rows = await tx.withdrawals.findMany({ where: { appId: input.appId, createdAt: { gte: window.start, lt: window.end }, status: { in: COUNTED_STATUSES } }, select: { userId: true, amount: true } });
        const userRows = rows.filter((row) => row.userId === input.userId); const total = sumAmounts(rows); const userTotal = sumAmounts(userRows); const users = new Set(rows.map((row) => row.userId));
        if (capacity.max_wd_transactions_per_day > 0 && rows.length >= capacity.max_wd_transactions_per_day) return this.createLockedWithdrawal(tx, input, wallet, available, 'PENDING_CAPACITY', risk.score);
        if (capacity.max_wd_users_per_day > 0 && users.size >= capacity.max_wd_users_per_day && !users.has(input.userId)) return this.createLockedWithdrawal(tx, input, wallet, available, 'PENDING_CAPACITY', risk.score);
        if (capacity.max_payout_amount_per_day > 0n && total + input.amount > capacity.max_payout_amount_per_day) return this.createLockedWithdrawal(tx, input, wallet, available, 'PENDING_CAPACITY', risk.score);
        if (capacity.max_wd_per_user_per_day > 0 && userRows.length >= capacity.max_wd_per_user_per_day) return this.createLockedWithdrawal(tx, input, wallet, available, 'PENDING_CAPACITY', risk.score);
        if (capacity.max_wd_amount_per_user_per_day > 0n && userTotal + input.amount > capacity.max_wd_amount_per_user_per_day) return this.createLockedWithdrawal(tx, input, wallet, available, 'PENDING_CAPACITY', risk.score);
      }
      return this.createLockedWithdrawal(tx, input, wallet, available, risk.level === 'LOW' ? 'APPROVED' : 'PENDING_REVIEW', risk.score);
    }, { isolationLevel: 'Serializable' });
  }
  private async createLockedWithdrawal(tx: Tx, input: { appId: string; userId: string; methodId: string; amount: bigint; idempotencyKey: string }, wallet: { lockedBalance: DecimalLike }, available: bigint, status: 'APPROVED' | 'PENDING_REVIEW' | 'PENDING_CAPACITY', riskScore: number) {
    const now = new Date(); const amount = input.amount.toString(); const previousLocked = BigInt(wallet.lockedBalance.toFixed(0));
    const updated = await tx.wallets.update({ where: { appId_userId: { appId: input.appId, userId: input.userId } }, data: { availableBalance: (available - input.amount).toString(), lockedBalance: (previousLocked + input.amount).toString(), version: { increment: 1n } } });
    try { return await tx.withdrawals.create({ data: { appId: input.appId, userId: input.userId, withdrawalMethodId: input.methodId, amount, fee: '0', netAmount: amount, currency: CURRENCY, status, idempotencyKey: input.idempotencyKey, lockedAt: now, approvedAt: status === 'APPROVED' ? now : undefined, riskScore } }); }
    catch (cause) { await tx.wallets.update({ where: { appId_userId: { appId: input.appId, userId: input.userId } }, data: { availableBalance: available.toString(), lockedBalance: previousLocked.toString(), version: updated.version } }); throw cause; }
  }
  private async syncWalletInTransaction(tx: Tx, appId: string, userId: string) {
    const accounts = await tx.$queryRaw<Array<{ balance: bigint }>>`SELECT "balance" FROM "coin_accounts" WHERE "appId" = ${appId} AND "userId" = ${userId} FOR UPDATE`;
    const coinBalance = accounts[0]?.balance ?? 0n;
    const wallet = await tx.wallets.upsert({ where: { appId_userId: { appId, userId } }, create: { appId, userId, availableBalance: '0', lockedBalance: '0', currency: CURRENCY, version: 0n }, update: {} });
    const available = coinBalance / COINS_PER_IDR - BigInt(wallet.lockedBalance.toFixed(0)); if (available < 0n) throw error(409, 'WALLET_INCONSISTENT', 'Wallet balance is inconsistent');
    return tx.wallets.update({ where: { appId_userId: { appId, userId } }, data: { availableBalance: available.toString(), currency: CURRENCY, version: { increment: 1n } } });
  }
  private async loadCapacity(appId: string): Promise<Capacity> {
    const setting = await this.db.appSettings.findUnique({ where: { appId_key: { appId, key: DAILY_CAPACITY_KEY } } }); const value = setting?.value; const object = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
    const number = (key: string) => typeof object[key] === 'number' && Number.isFinite(object[key]) ? Math.max(0, Math.floor(object[key] as number)) : 0;
    const amount = (key: string) => typeof object[key] === 'string' && /^\d+$/.test(object[key] as string) ? BigInt(object[key] as string) : 0n;
    return { max_wd_users_per_day: number('max_wd_users_per_day'), max_wd_transactions_per_day: number('max_wd_transactions_per_day'), max_payout_amount_per_day: amount('max_payout_amount_per_day'), max_wd_per_user_per_day: number('max_wd_per_user_per_day'), max_wd_amount_per_user_per_day: amount('max_wd_amount_per_user_per_day'), reset_time: typeof object.reset_time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(object.reset_time as string) ? object.reset_time as string : '00:00', enable_daily_limit: object.enable_daily_limit === true };
  }
}
function dailyWindow(resetTime: string): { start: Date; end: Date } { const [hour, minute] = resetTime.split(':').map(Number); const now = new Date(); const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); const [year, month, day] = date.split('-').map(Number); const start = new Date(Date.UTC(year, month - 1, day, hour - 7, minute)); if (start.getTime() > now.getTime()) start.setUTCDate(start.getUTCDate() - 1); const end = new Date(start); end.setUTCDate(end.getUTCDate() + 1); return { start, end }; }
function sumAmounts(rows: Array<{ amount: DecimalLike }>): bigint { return rows.reduce((sum, row) => sum + BigInt(row.amount.toFixed(0)), 0n); }
function error(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } { const e = new Error(message) as Error & { statusCode: number; code: string }; e.statusCode = statusCode; e.code = code; return e; }
export { COINS_PER_IDR, MIN_WITHDRAWAL_IDR };
