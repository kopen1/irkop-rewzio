import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../../core/redis.js';
import { RewardEngine, type RewardSource } from './engine.js';

const TZ = 'Asia/Jakarta';
const DAILY_SOURCE: RewardSource = 'daily_checkin';
const MISSION_SOURCE: RewardSource = 'mission';

export class DailyMissionService {
  private readonly engine: RewardEngine;
  constructor(private readonly db: PrismaClient, private readonly redis: RedisConnection) {
    this.engine = new RewardEngine(db, redis);
  }

  async rewards(appId: string) {
    return this.db.rewards.findMany({ where: { appId, status: 'CONFIRMED', sourceType: DAILY_SOURCE }, orderBy: { createdAt: 'desc' } });
  }

  async missions(appId: string, userId: string) {
    const now = new Date();
    return this.db.missions.findMany({ where: { appId, status: 'CONFIRMED', startAt: { lte: now }, OR: [{ endAt: null }, { endAt: { gte: now } }] }, orderBy: { createdAt: 'desc' } }).then(async (items) => {
      const ids = items.map((m) => m.id);
      const completions = ids.length ? await this.db.missionCompletions.findMany({ where: { appId, userId, missionId: { in: ids } } }) : [];
      const done = new Set(completions.filter((c) => c.status === 'CONFIRMED').map((c) => c.missionId));
      return items.map((m) => ({ ...m, completed: done.has(m.id) }));
    });
  }

  async mission(appId: string, userId: string, missionId: string) {
    const mission = await this.db.missions.findFirst({ where: { id: missionId, appId, status: 'CONFIRMED' } });
    if (!mission) throw error(404, 'MISSION_NOT_FOUND', 'Mission not found');
    const tasks = await this.db.missionTasks.findMany({ where: { appId, missionId }, orderBy: { sortOrder: 'asc' } });
    const completions = await this.db.missionCompletions.findMany({ where: { appId, userId, missionId } });
    return { ...mission, tasks, completions };
  }

  async startMission(appId: string, userId: string, missionId: string) {
    const mission = await this.db.missions.findFirst({ where: { id: missionId, appId, status: 'CONFIRMED' } });
    if (!mission) throw error(404, 'MISSION_NOT_FOUND', 'Mission not found');
    if (mission.startAt.getTime() > Date.now() || (mission.endAt && mission.endAt.getTime() < Date.now())) throw error(409, 'MISSION_INACTIVE', 'Mission is not active');
    await this.redis.incrementWithExpiry(`mission:start:${appId}:${userId}:${missionId}`, 86400);
    return { missionId, started: true };
  }

  async completeMission(appId: string, userId: string, sessionId: string, missionId: string, idempotencyKey: string, evidence: Record<string, unknown> = {}) {
    const mission = await this.db.missions.findFirst({ where: { id: missionId, appId, status: 'CONFIRMED' } });
    if (!mission) throw error(404, 'MISSION_NOT_FOUND', 'Mission not found');
    if (mission.startAt.getTime() > Date.now() || (mission.endAt && mission.endAt.getTime() < Date.now())) throw error(409, 'MISSION_INACTIVE', 'Mission is not active');
    const tasks = await this.db.missionTasks.findMany({ where: { appId, missionId }, orderBy: { sortOrder: 'asc' } });
    const validation = validateEvidence(tasks, evidence);
    if (!validation.valid) throw error(422, 'MISSION_COMPLETION_INVALID', validation.message);
    return this.claimMissionReward(appId, userId, sessionId, mission, idempotencyKey, evidence);
  }

  private async claimMissionReward(appId: string, userId: string, sessionId: string, mission: any, idempotencyKey: string, evidence: Record<string, unknown>) {
    const result = await this.db.$transaction(async (tx: any) => {
      const existing = await tx.missionCompletions.findFirst({ where: { appId, userId, missionId: mission.id, taskId: null } });
      if (existing) {
        if (existing.idempotencyKey === idempotencyKey && existing.status === 'CONFIRMED') return { existing, replay: true };
        throw error(409, 'MISSION_ALREADY_COMPLETED', 'Mission has already been completed');
      }
      const completion = await tx.missionCompletions.create({ data: { appId, userId, missionId: mission.id, taskId: null, status: 'PENDING', rewardAmount: mission.rewardAmount, completedAt: new Date(), idempotencyKey } });
      return { existing: completion, replay: false };
    }, { isolationLevel: 'Serializable' });
    if (result.replay) return { missionId: mission.id, completionId: result.existing.id, reward: result.existing.rewardAmount, status: 'CONFIRMED', replayed: true };
    const reward = await this.db.rewards.findFirst({ where: { appId, sourceType: MISSION_SOURCE, sourceId: mission.id, status: 'CONFIRMED' } });
    if (!reward || reward.amount !== mission.rewardAmount) throw error(409, 'REWARD_CONFIGURATION_INVALID', 'Mission reward configuration is invalid');
    const granted = await this.engine.grant({ userId, appId, sessionId, sourceType: MISSION_SOURCE, sourceId: mission.id, idempotencyKey: `mission:${idempotencyKey}`, metadata: { completionId: result.existing.id, evidence } });
    await this.db.missionCompletions.update({ where: { id: result.existing.id }, data: { status: 'CONFIRMED', rewardAmount: granted.amount } });
    return { missionId: mission.id, completionId: result.existing.id, reward: granted.amount, balance: granted.balance, ledgerId: granted.ledgerId, status: granted.status, replayed: false };
  }

  async claimDaily(appId: string, userId: string, sessionId: string, idempotencyKey: string) {
    const day = indonesiaDay(new Date());
    const reward = await this.db.dailyRewards.findFirst({ where: { appId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
    if (!reward) throw error(404, 'DAILY_REWARD_NOT_AVAILABLE', 'Daily reward is not available');
    const claim = await this.db.dailyRewardClaims.findFirst({ where: { appId, userId, dailyRewardId: reward.id, claimDate: day } });
    if (claim) {
      if (claim.idempotencyKey === idempotencyKey && claim.status === 'CONFIRMED') return { claimId: claim.id, amount: claim.rewardAmount, status: 'CONFIRMED', replayed: true, streak: await this.streak(appId, userId, reward.id, day) };
      throw error(409, 'DAILY_ALREADY_CLAIMED', 'Daily reward has already been claimed');
    }
    const count = await this.redis.incrementWithExpiry(`daily:claim:${appId}:${userId}:${day.toISOString().slice(0,10)}`, 86400);
    if (count > Math.max(1, reward.dailyLimit)) throw error(429, 'DAILY_RATE_LIMITED', 'Daily reward claim rate limit exceeded');
    const rewardDef = await this.db.rewards.findFirst({ where: { appId, sourceType: DAILY_SOURCE, sourceId: reward.id, status: 'CONFIRMED' } });
    if (!rewardDef || rewardDef.amount !== reward.rewardAmount) throw error(409, 'REWARD_CONFIGURATION_INVALID', 'Daily reward configuration is invalid');
    const created = await this.db.dailyRewardClaims.create({ data: { appId, userId, dailyRewardId: reward.id, claimDate: day, rewardAmount: reward.rewardAmount, status: 'PENDING', idempotencyKey } });
    try {
      const granted = await this.engine.grant({ userId, appId, sessionId, sourceType: DAILY_SOURCE, sourceId: reward.id, idempotencyKey: `daily:${idempotencyKey}` });
      await this.db.dailyRewardClaims.update({ where: { id: created.id }, data: { status: 'CONFIRMED', rewardAmount: granted.amount } });
      return { claimId: created.id, amount: granted.amount, balance: granted.balance, ledgerId: granted.ledgerId, status: granted.status, replayed: false, streak: await this.streak(appId, userId, reward.id, day) };
    } catch (e) {
      await this.db.dailyRewardClaims.update({ where: { id: created.id }, data: { status: 'REJECTED' } }).catch(() => undefined);
      throw e;
    }
  }

  private async streak(appId: string, userId: string, rewardId: string, day: Date) {
    const claims = await this.db.dailyRewardClaims.findMany({ where: { appId, userId, dailyRewardId: rewardId, status: 'CONFIRMED' }, orderBy: { claimDate: 'desc' } });
    let streak = 0; let cursor = day.getTime();
    for (const claim of claims) { if (claim.claimDate.getTime() !== cursor) break; streak++; cursor -= 86400000; }
    return streak;
  }
}

function indonesiaDay(now: Date): Date { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now); const y = parts.find((p) => p.type === 'year')!.value; const m = parts.find((p) => p.type === 'month')!.value; const d = parts.find((p) => p.type === 'day')!.value; return new Date(`${y}-${m}-${d}T00:00:00.000Z`); }
function validateEvidence(tasks: Array<{ requirements: unknown }>, evidence: Record<string, unknown>) { for (const task of tasks) { const req = task.requirements as Record<string, unknown>; for (const [key, expected] of Object.entries(req)) { if (evidence[key] === undefined) return { valid: false, message: `Missing mission evidence: ${key}` }; if (typeof expected === 'number' && Number(evidence[key]) < expected) return { valid: false, message: `Mission requirement not met: ${key}` }; if (typeof expected === 'string' && evidence[key] !== expected) return { valid: false, message: `Mission requirement not met: ${key}` }; } } return { valid: true, message: '' }; }
function error(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } { const e = new Error(message) as Error & { statusCode: number; code: string }; e.statusCode = statusCode; e.code = code; return e; }
