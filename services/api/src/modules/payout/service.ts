import type { Prisma, PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../../core/redis.js';
import { createPayoutProvider, type PayoutProvider, type ProviderPayoutStatus } from './provider.js';

type Tx = Prisma.TransactionClient;
type PayoutStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
const RETRIES = 3;
const TIMEOUT_MS = 10_000;

export class PayoutService {
  private readonly provider: PayoutProvider;
  constructor(private readonly db: PrismaClient, private readonly redis: RedisConnection, provider?: PayoutProvider) { this.provider = provider ?? createPayoutProvider(); }

  async processWithdrawal(appId: string, withdrawalId: string): Promise<unknown> {
    const tx = await this.db.payoutTransactions.findFirst({ where: { appId, withdrawalId } });
    if (tx && ['PROCESSING', 'COMPLETED'].includes(tx.status)) return tx;
    const withdrawal = await this.db.withdrawals.findFirst({ where: { appId, id: withdrawalId }, include: { withdrawalMethod: true } });
    if (!withdrawal) throw error(404, 'WITHDRAWAL_NOT_FOUND', 'Withdrawal not found');
    if (!['APPROVED', 'PENDING_PROVIDER', 'PROCESSING'].includes(withdrawal.status)) throw error(409, 'WITHDRAWAL_NOT_READY', 'Withdrawal is not ready for payout');
    const providerRecord = await this.db.paymentProviders.upsert({ where: { appId_code: { appId, code: this.provider.code } }, create: { appId, name: this.provider.code, code: this.provider.code, status: 'ACTIVE' }, update: { status: 'ACTIVE' } });
    const payout = await this.db.$transaction(async (db: Tx) => {
      const existing = await db.payoutTransactions.findUnique({ where: { idempotencyKey: `withdrawal:${withdrawal.id}` } });
      if (existing) return existing;
      await db.withdrawals.update({ where: { id: withdrawal.id }, data: { status: 'PROCESSING' } });
      return db.payoutTransactions.create({ data: { appId, withdrawalId: withdrawal.id, providerId: providerRecord.id, amount: withdrawal.netAmount, fee: withdrawal.fee, currency: withdrawal.currency, status: 'PROCESSING', idempotencyKey: `withdrawal:${withdrawal.id}` } });
    }, { isolationLevel: 'Serializable' });
    let lastError = '';
    for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
      try {
        const result = await withTimeout(this.provider.createPayout({ transactionId: payout.id, withdrawalId: withdrawal.id, amount: payout.amount.toFixed(2), fee: payout.fee.toFixed(2), currency: payout.currency, accountName: withdrawal.withdrawalMethod.accountName, accountNumber: withdrawal.withdrawalMethod.accountNumberEncrypted, methodType: withdrawal.withdrawalMethod.type }), TIMEOUT_MS);
        return this.recordProviderAcceptance(appId, payout.id, result.providerReference, result.status);
      } catch (cause) { lastError = cause instanceof Error ? cause.message : 'Provider error'; await this.db.payoutTransactions.update({ where: { id: payout.id }, data: { lastError } }).catch(() => undefined); if (attempt < RETRIES) await sleep(attempt * 250); }
    }
    await this.db.$transaction(async (db: Tx) => { await db.payoutTransactions.update({ where: { id: payout.id }, data: { status: 'FAILED', lastError, processedAt: new Date() } }); await db.withdrawals.update({ where: { id: withdrawal.id }, data: { status: 'FAILED', failureReason: lastError } }); await releaseLockedBalance(db, withdrawal.appId, withdrawal.userId, withdrawal.amount.toFixed(0)); }, { isolationLevel: 'Serializable' });
    await this.redis.set(`payout:dead-letter:${payout.id}`, JSON.stringify({ payoutId: payout.id, withdrawalId: withdrawal.id, error: lastError, attempts: RETRIES }), 86400 * 30);
    return this.db.payoutTransactions.findUnique({ where: { id: payout.id } });
  }

  async handleWebhook(input: { appId: string; providerCode: string; signature?: string; rawPayload: string; payload: Record<string, unknown> }): Promise<unknown> {
    const provider = createPayoutProvider(input.providerCode); if (!provider.verifyWebhook(input.signature, input.rawPayload)) throw error(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature');
    const parsed = provider.parseWebhook(input.payload);
    const providerRecord = await this.db.paymentProviders.findFirst({ where: { appId: input.appId, code: provider.code, status: 'ACTIVE' } }); if (!providerRecord) throw error(404, 'PROVIDER_NOT_FOUND', 'Payment provider not active');
    const webhook = await this.db.paymentWebhooks.upsert({ where: { appId_providerId_eventId: { appId: input.appId, providerId: providerRecord.id, eventId: parsed.eventId } }, create: { appId: input.appId, providerId: providerRecord.id, eventId: parsed.eventId, eventType: parsed.eventType, signature: input.signature, payload: redactPayload(input.payload), status: 'RECEIVED', receivedAt: new Date(), idempotencyKey: `webhook:${provider.code}:${parsed.eventId}` }, update: {} });
    if (webhook.status === 'PROCESSED') return { duplicate: true, webhook };
    try {
      const result = await this.db.$transaction(async (db: Tx) => {
        const payout = await db.payoutTransactions.findFirst({ where: { appId: input.appId, providerId: providerRecord.id, providerReference: parsed.providerReference } });
        if (!payout) throw error(404, 'PAYOUT_NOT_FOUND', 'Payout transaction not found');
        const locked = await db.payoutTransactions.findUnique({ where: { id: payout.id } }); if (!locked) throw error(404, 'PAYOUT_NOT_FOUND', 'Payout transaction not found');
        const next = mapPayoutStatus(parsed.status); await db.payoutTransactions.update({ where: { id: payout.id }, data: { status: next, processedAt: ['COMPLETED', 'FAILED'].includes(next) ? new Date() : undefined } });
        const withdrawal = await db.withdrawals.findUnique({ where: { id: payout.withdrawalId } }); if (!withdrawal) throw error(404, 'WITHDRAWAL_NOT_FOUND', 'Withdrawal not found');
        if (next === 'COMPLETED') { await db.withdrawals.update({ where: { id: withdrawal.id }, data: { status: 'COMPLETED', completedAt: new Date(), providerReference: parsed.providerReference } }); await releaseLockedBalance(db, withdrawal.appId, withdrawal.userId, withdrawal.amount.toFixed(0)); }
        else if (next === 'FAILED') { await db.withdrawals.update({ where: { id: withdrawal.id }, data: { status: 'REFUNDED', failureReason: 'Provider payout failed', providerReference: parsed.providerReference } }); await releaseLockedBalance(db, withdrawal.appId, withdrawal.userId, withdrawal.amount.toFixed(0)); }
        else { await db.withdrawals.update({ where: { id: withdrawal.id }, data: { status: 'PENDING_PROVIDER', providerReference: parsed.providerReference } }); }
        await db.paymentWebhooks.update({ where: { id: webhook.id }, data: { status: 'PROCESSED', processedAt: new Date() } });
        await db.fraudEvents.create({ data: { appId: input.appId, userId: withdrawal.userId, type: `PAYOUT_WEBHOOK_${next}`, severity: 'LOW', scoreDelta: 0, metadata: { payoutId: payout.id, provider: provider.code, eventId: parsed.eventId } } });
        return { payoutId: payout.id, status: next, withdrawalId: withdrawal.id };
      }, { isolationLevel: 'Serializable' });
      return result;
    } catch (cause) { await this.db.paymentWebhooks.update({ where: { id: webhook.id }, data: { status: 'FAILED', errorMessage: cause instanceof Error ? cause.message : 'Webhook processing failed' } }).catch(() => undefined); throw cause; }
  }

  async reconcile(appId: string, limit = 100): Promise<Array<{ payoutId: string; internal: PayoutStatus; provider: ProviderPayoutStatus; action: string }>> {
    const rows = await this.db.payoutTransactions.findMany({ where: { appId, status: { in: ['PENDING', 'PROCESSING'] }, providerReference: { not: null } }, orderBy: { updatedAt: 'asc' }, take: Math.min(500, Math.max(1, limit)) });
    const results: Array<{ payoutId: string; internal: PayoutStatus; provider: ProviderPayoutStatus; action: string }> = [];
    for (const row of rows) results.push({ payoutId: row.id, internal: row.status, provider: 'PENDING', action: 'PROVIDER_STATUS_LOOKUP_REQUIRED' });
    await this.redis.set(`payout:reconciliation:${appId}`, JSON.stringify({ checkedAt: new Date().toISOString(), count: results.length }), 86400);
    return results;
  }

  async getPayout(appId: string, userId: string, withdrawalId: string): Promise<unknown> {
    const withdrawal = await this.db.withdrawals.findFirst({ where: { appId, id: withdrawalId, userId }, select: { id: true } });
    if (!withdrawal) throw error(404, 'PAYOUT_NOT_FOUND', 'Payout transaction not found');
    return this.db.payoutTransactions.findFirst({ where: { appId, withdrawalId: withdrawal.id }, orderBy: { createdAt: 'desc' } });
  }

  async listWebhooks(appId: string, limit = 100): Promise<unknown> { return this.db.paymentWebhooks.findMany({ where: { appId }, orderBy: { receivedAt: 'desc' }, take: Math.min(500, Math.max(1, limit)) }); }

  private async recordProviderAcceptance(appId: string, payoutId: string, reference: string, status: ProviderPayoutStatus): Promise<unknown> {
    const payoutStatus: PayoutStatus = status === 'COMPLETED' ? 'COMPLETED' : status === 'FAILED' ? 'FAILED' : 'PENDING';
    return this.db.$transaction(async (db: Tx) => {
      const payout = await db.payoutTransactions.findUnique({ where: { id: payoutId } }); if (!payout) throw error(404, 'PAYOUT_NOT_FOUND', 'Payout transaction not found');
      await db.payoutTransactions.update({ where: { id: payoutId }, data: { providerReference: reference, status: payoutStatus, processedAt: payoutStatus === 'COMPLETED' || payoutStatus === 'FAILED' ? new Date() : undefined } });
      const withdrawal = await db.withdrawals.findUnique({ where: { id: payout.withdrawalId } }); if (!withdrawal) throw error(404, 'WITHDRAWAL_NOT_FOUND', 'Withdrawal not found');
      if (payoutStatus === 'COMPLETED') { await db.withdrawals.update({ where: { id: withdrawal.id }, data: { status: 'COMPLETED', completedAt: new Date(), providerReference: reference } }); await releaseLockedBalance(db, withdrawal.appId, withdrawal.userId, withdrawal.amount.toFixed(0)); }
      else if (payoutStatus === 'FAILED') { await db.withdrawals.update({ where: { id: withdrawal.id }, data: { status: 'REFUNDED', failureReason: 'Provider rejected payout', providerReference: reference } }); await releaseLockedBalance(db, withdrawal.appId, withdrawal.userId, withdrawal.amount.toFixed(0)); }
      else await db.withdrawals.update({ where: { id: withdrawal.id }, data: { status: 'PENDING_PROVIDER', providerReference: reference } });
      await db.fraudEvents.create({ data: { appId, userId: withdrawal.userId, type: 'PAYOUT_PROVIDER_ACCEPTED', severity: 'LOW', scoreDelta: 0, metadata: { payoutId, providerReference: reference, final: payoutStatus === 'COMPLETED' || payoutStatus === 'FAILED' } } });
      return db.payoutTransactions.findUnique({ where: { id: payoutId } });
    }, { isolationLevel: 'Serializable' });
  }
}
async function releaseLockedBalance(tx: Tx, appId: string, userId: string, amount: string): Promise<void> { const rows = await tx.$queryRaw<Array<{ locked_balance: string; version: bigint }>>`SELECT "lockedBalance"::text AS locked_balance, "version" FROM "wallets" WHERE "appId" = ${appId} AND "userId" = ${userId} FOR UPDATE`; const row = rows[0]; if (!row) throw error(409, 'WALLET_NOT_FOUND', 'Wallet not found'); const locked = BigInt(row.locked_balance); const release = BigInt(amount); if (locked < release) throw error(409, 'WALLET_LOCK_INCONSISTENT', 'Locked balance is inconsistent'); await tx.wallets.update({ where: { appId_userId: { appId, userId } }, data: { lockedBalance: (locked - release).toString(), availableBalance: { increment: release.toString() }, version: { increment: 1n } } }); }
function mapPayoutStatus(status: ProviderPayoutStatus): PayoutStatus { return status === 'COMPLETED' ? 'COMPLETED' : status === 'FAILED' ? 'FAILED' : status === 'ACCEPTED' ? 'PROCESSING' : 'PENDING'; }
function redactPayload(payload: Record<string, unknown>): Record<string, unknown> { const copy = { ...payload }; for (const key of Object.keys(copy)) if (/token|secret|authorization|password|accountnumber|account_number/i.test(key)) copy[key] = '[REDACTED]'; return copy; }
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> { return new Promise<T>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Payout provider timeout')), ms); promise.then((value) => { clearTimeout(timer); resolve(value); }, (err) => { clearTimeout(timer); reject(err); }); }); }
function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
function error(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } { const e = new Error(message) as Error & { statusCode: number; code: string }; e.statusCode = statusCode; e.code = code; return e; }
