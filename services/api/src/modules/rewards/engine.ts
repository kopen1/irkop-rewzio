import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../../core/redis.js';
import { CoinLedgerService } from '../coins/service.js';

export const REWARD_SOURCES = [
  'daily_checkin', 'mission', 'watch', 'ads', 'survey', 'offerwall', 'referral',
  'lucky_reward', 'spin', 'quiz', 'game', 'sponsor', 'affiliate',
] as const;
export type RewardSource = typeof REWARD_SOURCES[number];
export type RewardStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'REVERSED';

export interface RewardRequest {
  userId: string;
  appId: string;
  sessionId: string;
  sourceType: RewardSource;
  sourceId?: string;
  idempotencyKey: string;
  metadata?: unknown;
}

export interface RewardResult {
  rewardId: string;
  redemptionId: string;
  ledgerId: string;
  amount: bigint;
  balance: bigint;
  status: 'CONFIRMED';
  replayed: boolean;
}

interface RewardHooks {
  integrity?: (input: RewardRequest, device: { id: string; integrityStatus: string; riskScore: number }) => Promise<void>;
  fraud?: (input: RewardRequest, device: { id: string; integrityStatus: string; riskScore: number }) => Promise<void>;
  eligibility?: (input: RewardRequest, reward: { id: string; amount: bigint; status: string }) => Promise<void>;
}

export class RewardEngine {
  private readonly coins: CoinLedgerService;

  constructor(
    private readonly db: PrismaClient,
    private readonly redis: RedisConnection,
    private readonly hooks: RewardHooks = {},
  ) { this.coins = new CoinLedgerService(db); }

  async grant(input: RewardRequest): Promise<RewardResult> {
    validateRequest(input);
    const existing = await this.db.rewardRedemptions.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.userId !== input.userId || existing.appId !== input.appId || existing.rewardId === '') throw rewardError('IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for a different reward', 409);
      if (existing.status === 'CONFIRMED') {
        const ledger = await this.db.coinLedger.findUnique({ where: { id: existing.id } });
        if (ledger) return { rewardId: existing.rewardId, redemptionId: existing.id, ledgerId: ledger.id, amount: existing.amount, balance: ledger.balanceAfter, status: 'CONFIRMED', replayed: true };
      }
      throw rewardError('REWARD_ALREADY_PROCESSED', 'Reward request has already been processed', 409);
    }

    const rateKey = `reward:rate:${input.appId}:${input.userId}`;
    const rateCount = await this.redis.incrementWithExpiry(rateKey, 60);
    if (rateCount > 30) throw rewardError('REWARD_RATE_LIMITED', 'Reward request rate limit exceeded', 429);

    const [user, session] = await Promise.all([
      this.db.users.findUnique({ where: { id: input.userId } }),
      this.db.userSessions.findUnique({ where: { id: input.sessionId } }),
    ]);
    if (!user || user.status !== 'ACTIVE') throw rewardError('ACCOUNT_NOT_ELIGIBLE', 'Account is not eligible for rewards', 403);
    if (!session || session.userId !== input.userId || session.appId !== input.appId || session.status !== 'ACTIVE' || session.expiresAt.getTime() <= Date.now()) throw rewardError('SESSION_INVALID', 'Session is invalid or expired', 401);

    const userApp = await this.db.userApps.findUnique({ where: { appId_userId: { appId: input.appId, userId: input.userId } } });
    if (!userApp || userApp.status !== 'ACTIVE') throw rewardError('APP_NOT_ELIGIBLE', 'User is not active in this app', 403);

    if (!session.deviceId) throw rewardError('DEVICE_REQUIRED', 'An active device is required for rewards', 403);
    const device = await this.db.userDevices.findUnique({ where: { id: session.deviceId } });
    if (!device || device.userId !== input.userId || device.appId !== input.appId || device.status !== 'ACTIVE') throw rewardError('DEVICE_INVALID', 'Device is not eligible for rewards', 403);
    if (device.integrityStatus === 'FAILED' || device.integrityStatus === 'UNSUPPORTED') throw rewardError('INTEGRITY_FAILED', 'Device integrity check failed', 403);
    await this.hooks.integrity?.(input, device);
    if (device.riskScore >= 80) throw rewardError('FRAUD_REJECTED', 'Reward request rejected by fraud controls', 403);
    await this.hooks.fraud?.(input, device);

    const reward = await this.db.rewards.findFirst({ where: { appId: input.appId, sourceType: input.sourceType, sourceId: input.sourceId ?? null, status: 'CONFIRMED' }, orderBy: { createdAt: 'desc' } });
    if (!reward || reward.amount <= 0n) throw rewardError('REWARD_NOT_AVAILABLE', 'Reward is not available', 404);
    await this.hooks.eligibility?.(input, reward);

    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const duplicate = await tx.rewardRedemptions.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (duplicate) {
        if (duplicate.userId !== input.userId || duplicate.appId !== input.appId || duplicate.rewardId !== reward.id) throw rewardError('IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for a different reward', 409);
        throw rewardError('REWARD_ALREADY_PROCESSED', 'Reward request has already been processed', 409);
      }

      const redemption = await tx.rewardRedemptions.create({
        data: {
          appId: input.appId,
          userId: input.userId,
          rewardId: reward.id,
          amount: reward.amount,
          status: 'PENDING',
          idempotencyKey: input.idempotencyKey,
        },
      });

      const ledgerResult = await this.coins.createLedgerEntryInTransaction(tx, {
        userId: input.userId,
        appId: input.appId,
        transactionType: 'REWARD_CREDIT',
        source: input.sourceType,
        amount: reward.amount,
        referenceId: redemption.id,
        status: 'CONFIRMED',
        metadata: {
          rewardId: reward.id,
          redemptionId: redemption.id,
          sourceId: input.sourceId ?? null,
          requestHash: hashRequest(input),
          clientAmountIgnored: true,
          ...(input.metadata === undefined ? {} : { context: input.metadata }),
        },
        idempotencyKey: `reward:${redemption.id}`,
      });

      await tx.rewardRedemptions.update({ where: { id: redemption.id }, data: { status: 'CONFIRMED' } });
      return { rewardId: reward.id, redemptionId: redemption.id, ledgerId: ledgerResult.ledgerId, amount: reward.amount, balance: ledgerResult.balance, status: 'CONFIRMED', replayed: false };
    }, { isolationLevel: 'Serializable' });
  }
}

function validateRequest(input: RewardRequest): void {
  if (!input.userId || !input.appId || !input.sessionId || !input.sourceType) throw rewardError('INVALID_REWARD_REQUEST', 'userId, appId, sessionId and sourceType are required', 400);
  if (!REWARD_SOURCES.includes(input.sourceType)) throw rewardError('INVALID_REWARD_SOURCE', 'Unsupported reward source', 400);
  if (!input.idempotencyKey || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 255) throw rewardError('INVALID_IDEMPOTENCY_KEY', 'Invalid idempotency key', 400);
}
function hashRequest(input: RewardRequest): string { return createHash('sha256').update(JSON.stringify({ userId: input.userId, appId: input.appId, sessionId: input.sessionId, sourceType: input.sourceType, sourceId: input.sourceId ?? null, idempotencyKey: input.idempotencyKey })).digest('hex'); }
function rewardError(code: string, message: string, statusCode = 500): Error & { code: string; statusCode: number } { const error = new Error(message) as Error & { code: string; statusCode: number }; error.code = code; error.statusCode = statusCode; return error; }
