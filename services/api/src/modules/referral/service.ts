import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../../core/redis.js';
import { RewardEngine } from '../rewards/engine.js';

const QUALIFYING_SOURCES = new Set(['watch', 'ads', 'survey', 'offerwall', 'mission', 'quiz', 'game', 'spin', 'lucky_reward']);

export class ReferralService {
  private readonly rewards: RewardEngine;
  constructor(private readonly db: PrismaClient, private readonly redis: RedisConnection) { this.rewards = new RewardEngine(db, redis); }

  async create(appId: string, referredUserId: string, code: string): Promise<{ referralId: string; status: string }> {
    if (!code || code.length > 255) throw err('INVALID_REFERRAL_CODE', 'Invalid referral code', 400);
    const referrer = await this.db.users.findUnique({ where: { referralCode: code } });
    if (!referrer || referrer.id === referredUserId) throw err('INVALID_REFERRAL', 'Referral code is invalid', 400);
    const existing = await this.db.referrals.findUnique({ where: { appId_referredUserId: { appId, referredUserId } } });
    if (existing) return { referralId: existing.id, status: existing.status };
    const [referrerProfile, referredProfile, referrerSession, referredSession, referrerDevice, referredDevice] = await Promise.all([
      this.db.userProfiles.findUnique({ where: { userId: referrer.id } }),
      this.db.userProfiles.findUnique({ where: { userId: referredUserId } }),
      this.db.userSessions.findFirst({ where: { appId, userId: referrer.id, status: 'ACTIVE' }, orderBy: { lastSeenAt: 'desc' } }),
      this.db.userSessions.findFirst({ where: { appId, userId: referredUserId, status: 'ACTIVE' }, orderBy: { lastSeenAt: 'desc' } }),
      this.db.userDevices.findFirst({ where: { appId, userId: referrer.id, status: 'ACTIVE' }, orderBy: { lastSeenAt: 'desc' } }),
      this.db.userDevices.findFirst({ where: { appId, userId: referredUserId, status: 'ACTIVE' }, orderBy: { lastSeenAt: 'desc' } }),
    ]);
    if (referrerProfile?.userId === referredProfile?.userId) throw err('REFERRAL_ABUSE', 'Referral account relationship is invalid', 403);
    if (referrerDevice?.deviceHash && referrerDevice.deviceHash === referredDevice?.deviceHash) throw err('REFERRAL_ABUSE', 'Referral rejected by anti-abuse controls', 403);
    if (referrerSession?.ipAddress && referrerSession.ipAddress === referredSession?.ipAddress) throw err('REFERRAL_ABUSE', 'Referral rejected by anti-abuse controls', 403);
    const referral = await this.db.referrals.create({ data: { appId, referrerUserId: referrer.id, referredUserId, code, status: 'PENDING' } });
    return { referralId: referral.id, status: referral.status };
  }

  async qualify(appId: string, referralId: string, sessionId: string): Promise<{ referralId: string; status: string; rewarded: boolean }> {
    const referral = await this.db.referrals.findUnique({ where: { id: referralId } });
    if (!referral || referral.appId !== appId) throw err('REFERRAL_NOT_FOUND', 'Referral not found', 404);
    if (referral.status === 'REWARDED' || referral.status === 'REJECTED') return { referralId, status: referral.status, rewarded: referral.status === 'REWARDED' };
    const referredRedemptions = await this.db.rewardRedemptions.findMany({ where: { appId, userId: referral.referredUserId, status: 'CONFIRMED' }, include: { reward: true }, orderBy: { createdAt: 'asc' }, take: 50 });
    const qualifying = referredRedemptions.find((r) => QUALIFYING_SOURCES.has(r.reward.sourceType));
    if (!qualifying) throw err('REFERRAL_NOT_QUALIFIED', 'A qualifying activity is required before referral reward', 409);
    const [referrerDevices, referredDevices, referrerSessions, referredSessions, withdrawals, rewardPattern] = await Promise.all([
      this.db.userDevices.findMany({ where: { appId, userId: referral.referrerUserId }, select: { deviceHash: true }, take: 10 }),
      this.db.userDevices.findMany({ where: { appId, userId: referral.referredUserId }, select: { deviceHash: true }, take: 10 }),
      this.db.userSessions.findMany({ where: { appId, userId: referral.referrerUserId }, select: { ipAddress: true }, take: 20 }),
      this.db.userSessions.findMany({ where: { appId, userId: referral.referredUserId }, select: { ipAddress: true }, take: 20 }),
      this.db.withdrawals.count({ where: { appId, userId: referral.referrerUserId, status: { in: ['PENDING_REVIEW','APPROVED','PROCESSING','PENDING_PROVIDER','COMPLETED'] } } }),
      this.db.rewardRedemptions.count({ where: { appId, userId: referral.referrerUserId, status: 'CONFIRMED', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    ]);
    const referrerHashes = new Set(referrerDevices.map((d) => d.deviceHash));
    if (referredDevices.some((d) => referrerHashes.has(d.deviceHash))) return this.reject(referralId, 'REFERRAL_DEVICE_MATCH');
    const referrerIps = new Set(referrerSessions.map((s) => s.ipAddress).filter(Boolean));
    if (referredSessions.some((s) => s.ipAddress && referrerIps.has(s.ipAddress))) return this.reject(referralId, 'REFERRAL_IP_MATCH');
    if (withdrawals > 20) return this.reject(referralId, 'REFERRAL_WITHDRAWAL_PATTERN');
    if (rewardPattern > 100) return this.reject(referralId, 'REFERRAL_REWARD_PATTERN');
    const velocity = await this.redis.incrementWithExpiry(`referral:qualify:${appId}:${referral.referrerUserId}`, 3600);
    if (velocity > 20) return this.reject(referralId, 'REFERRAL_VELOCITY');
    await this.db.referrals.update({ where: { id: referralId }, data: { status: 'QUALIFIED', qualifiedAt: new Date() } });
    const reward = await this.db.rewards.findFirst({ where: { appId, sourceType: 'referral', sourceId: referralId, status: 'CONFIRMED' }, orderBy: { createdAt: 'desc' } });
    if (!reward) return { referralId, status: 'QUALIFIED', rewarded: false };
    const result = await this.rewards.grant({ appId, userId: referral.referrerUserId, sessionId, sourceType: 'referral', sourceId: referralId, idempotencyKey: `referral:${referralId}`, metadata: { qualifyingRewardId: qualifying.id, antiAbuse: 'device-ip-behavior-relationship-velocity-reward-withdrawal' } });
    await this.db.referrals.update({ where: { id: referralId }, data: { status: 'REWARDED' } });
    await this.db.referralRewards.upsert({ where: { idempotencyKey: `referral:${referralId}` }, create: { appId, referralId, userId: referral.referrerUserId, rewardAmount: result.amount, status: 'CONFIRMED', idempotencyKey: `referral:${referralId}` }, update: { status: 'CONFIRMED', rewardAmount: result.amount } });
    return { referralId, status: 'REWARDED', rewarded: true };
  }

  private async reject(id: string, reason: string): Promise<{ referralId: string; status: string; rewarded: boolean }> {
    await this.db.referrals.update({ where: { id }, data: { status: 'REJECTED' } });
    return { referralId: id, status: `REJECTED:${reason}`, rewarded: false };
  }
}
function err(code: string, message: string, statusCode: number): Error & { code: string; statusCode: number } { return Object.assign(new Error(message), { code, statusCode }); }
