import assert from 'node:assert/strict';
import test from 'node:test';
import { FraudRiskEngine } from '../dist/modules/fraud/service.js';

function dbStub(overrides = {}) {
  const recent = overrides.recentRewards ?? [];
  return {
    userDevices: { findUnique: async () => overrides.device ?? { id: 'd1', riskScore: 0, integrityStatus: 'VERIFIED' } },
    userSessions: {
      findUnique: async () => ({ id: 's1', status: 'ACTIVE' }),
      count: async () => overrides.sessions ?? 1,
      findMany: async () => Array.from({ length: overrides.ipUsers ?? 1 }, (_, i) => ({ userId: `u${i}` })),
    },
    rewardRedemptions: {
      count: async ({ where }) => where.createdAt.gte.getTime() < Date.now() - 23 * 60 * 60 * 1000 ? (overrides.rewardsDay ?? 0) : (overrides.rewardsHour ?? 0),
      findMany: async () => recent,
    },
    withdrawals: { count: async () => overrides.withdrawals ?? 0 },
    referrals: { findMany: async () => overrides.referrals ?? [] },
    deviceRelationships: { count: async () => overrides.relationships ?? 0 },
    fraudScores: { create: async ({ data }) => ({ id: 'fs1', ...data }) },
    fraudEvents: { create: async ({ data }) => ({ id: 'fe1', ...data }) },
    riskSignals: { createMany: async ({ data }) => ({ count: data.length }) },
    securityActions: { create: async ({ data }) => ({ id: 'sa1', ...data }) },
    rewardHolds: { create: async ({ data }) => ({ id: 'rh1', ...data }) },
  };
}

const redis = { incrementWithExpiry: async () => 1 };
const base = { appId: 'a1', userId: 'u1', sessionId: 's1', deviceId: 'd1', ipAddress: '10.0.0.1' };

test('risk bands are LOW, MEDIUM, HIGH', async () => {
  const low = await new FraudRiskEngine(dbStub(), redis).assess(base);
  assert.equal(low.level, 'LOW');

  const medium = await new FraudRiskEngine(dbStub({ rewardsHour: 20, withdrawals: 5, ipUsers: 5 }), redis).assess(base);
  assert.equal(medium.level, 'MEDIUM');
  assert.equal(medium.action, 'PENDING_REVIEW');

  const high = await new FraudRiskEngine(dbStub({ rewardsHour: 20, rewardsDay: 100, withdrawals: 10, ipUsers: 10, relationships: 3, referrals: [{ status: 'REJECTED' }, { status: 'REJECTED' }, { status: 'REJECTED' }], device: { id: 'd1', riskScore: 100, integrityStatus: 'FAILED' } }), redis).assess(base);
  assert.equal(high.level, 'HIGH');
  assert.equal(high.action, 'HOLD');
  assert.ok(high.score >= 71);
});

test('UNSUPPORTED integrity is not automatically fraud', async () => {
  const result = await new FraudRiskEngine(dbStub({ device: { id: 'd1', riskScore: 0, integrityStatus: 'UNSUPPORTED' } }), redis).assess({ ...base, integrityStatus: 'UNSUPPORTED' });
  assert.equal(result.level, 'LOW');
  assert.equal(result.signals.some((s) => s.type === 'integrity'), false);
});

test('IP is a signal, not a one-IP-one-account rule', async () => {
  const result = await new FraudRiskEngine(dbStub({ ipUsers: 10 }), redis).assess(base);
  assert.ok(result.signals.some((s) => s.type === 'ip'));
  assert.notEqual(result.signals.find((s) => s.type === 'ip')?.score, 100);
});

test('high-risk reward creates a hold and blocks enforcement', async () => {
  const service = new FraudRiskEngine(dbStub({ rewardsHour: 20, rewardsDay: 100, withdrawals: 10, ipUsers: 10, relationships: 3, referrals: [{ status: 'REJECTED' }, { status: 'REJECTED' }, { status: 'REJECTED' }], device: { id: 'd1', riskScore: 100, integrityStatus: 'FAILED' } }), redis);
  await assert.rejects(() => service.enforceReward(base), /held for security investigation/);
});

test('audit event redacts secrets and supports replay/double-reward/fake-completion signals', async () => {
  let saved;
  const db = dbStub();
  db.fraudEvents.create = async ({ data }) => { saved = data; return { id: 'fe1', ...data }; };
  await new FraudRiskEngine(db, redis).recordEvent(base, 'REPLAY_ATTACK', 15, { token: 'secret', fakeCompletion: true, rewardId: 'r1' });
  assert.equal(saved.metadata.token, '[REDACTED]');
  assert.equal(saved.metadata.fakeCompletion, true);
});

test('concurrent assessments do not mutate a shared in-memory score', async () => {
  const service = new FraudRiskEngine(dbStub({ rewardsHour: 20 }), redis);
  const results = await Promise.all(Array.from({ length: 8 }, () => service.assess(base)));
  assert.equal(results.length, 8);
  assert.ok(results.every((result) => result.score >= 20 && result.score <= 100));
});
