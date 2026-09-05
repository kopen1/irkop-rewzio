import assert from 'node:assert/strict';
import test from 'node:test';
import { ReferralService } from '../dist/modules/referral/service.js';
import { LuckySpinGameService } from '../dist/modules/lucky-spin-game/service.js';

function redisStub(value = null, count = 0) {
  return { get: async () => value, set: async () => {}, incrementWithExpiry: async () => ++count };
}

test('referral rejects invalid/self code', async () => {
  const db = { users: { findUnique: async () => ({ id: 'u1' }) }, referrals: { findUnique: async () => null } };
  const service = new ReferralService(db, redisStub());
  await assert.rejects(() => service.create('a1', 'u1', 'CODE'), /Referral code is invalid/);
});

test('outcome rejects replayed daily limit before reward', async () => {
  const db = {};
  const service = new LuckySpinGameService(db, redisStub(null, 10));
  await assert.rejects(() => service.play('a1', 'u1', 's1', 'spin', 'idem-1234'), /daily limit reached/);
});

test('outcome idempotency replay is returned without trusting client outcome', async () => {
  const saved = JSON.stringify({ status: 'CONFIRMED', kind: 'game', outcomeId: 'server', name: 'Server Prize', amount: '10', rewardId: 'r1' });
  const db = {};
  const service = new LuckySpinGameService(db, redisStub(saved));
  const result = await service.play('a1', 'u1', 's1', 'game', 'idem-1234');
  assert.equal(result.replayed, true);
  assert.equal(result.outcomeId, 'server');
  assert.equal(result.status, 'CONFIRMED');
});
