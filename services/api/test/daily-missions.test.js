import test from 'node:test';
import assert from 'node:assert/strict';
import { DailyMissionService } from '../dist/modules/rewards/daily-missions.js';

test('daily and mission service exposes required operations', () => {
  assert.equal(typeof DailyMissionService.prototype.claimDaily, 'function');
  assert.equal(typeof DailyMissionService.prototype.completeMission, 'function');
  assert.equal(typeof DailyMissionService.prototype.startMission, 'function');
  assert.equal(typeof DailyMissionService.prototype.missions, 'function');
  assert.equal(typeof DailyMissionService.prototype.mission, 'function');
});

test('invalid mission completion cannot pass missing server requirements', async () => {
  const db = { missions: { findFirst: async () => ({ id: 'm1', appId: 'a1', status: 'CONFIRMED', startAt: new Date(Date.now() - 1000), endAt: null, rewardAmount: 10n }) }, missionTasks: { findMany: async () => [{ requirements: { completed: true } }] } };
  const redis = { incrementWithExpiry: async () => 1 };
  const service = new DailyMissionService(db, redis);
  await assert.rejects(() => service.completeMission('a1', 'u1', 's1', 'm1', 'idem-1234', {}), /Mission completion invalid|Missing mission evidence/);
});

test('invalid idempotency keys are rejected before claim processing', async () => {
  const db = { dailyRewards: { findFirst: async () => ({ id: 'd1', rewardAmount: 10n, dailyLimit: 1, status: 'ACTIVE' }) } };
  const redis = { incrementWithExpiry: async () => 1 };
  const service = new DailyMissionService(db, redis);
  await assert.rejects(() => service.claimDaily('a1', 'u1', 's1', 'x'), /Invalid idempotency key/);
});
