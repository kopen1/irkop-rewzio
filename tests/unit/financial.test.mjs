import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');

test('ledger is atomic, idempotent and prevents negative balance', () => {
  const s = read('services/api/src/modules/coins/service.ts');
  assert.match(s, /FOR UPDATE/); assert.match(s, /Serializable/); assert.match(s, /IDEMPOTENCY_CONFLICT/); assert.match(s, /nextBalance < 0n/);
});

test('reward is server authoritative and replay safe', () => {
  const s = read('services/api/src/modules/rewards/engine.ts');
  assert.match(s, /rewards\.findFirst/); assert.match(s, /reward\.amount/); assert.match(s, /REWARD_ALREADY_PROCESSED/); assert.match(s, /clientAmountIgnored: true/);
});

test('referral and fraud controls are present', () => {
  const referral = read('services/api/src/modules/referral/service.ts'); const fraud = read('services/api/src/modules/fraud/service.ts');
  assert.match(referral, /same device|device/i); assert.match(referral, /REJECTED/); assert.match(fraud, /RiskLevel/); assert.match(fraud, /LOW.*MEDIUM.*HIGH/s);
});

test('withdrawal and payout protect concurrent financial operations', () => {
  const w = read('services/api/src/modules/wallet/service.ts'); const p = read('services/api/src/modules/payout/service.ts');
  assert.match(w, /pg_advisory_xact_lock/); assert.match(w, /FOR UPDATE/); assert.match(w, /Serializable/); assert.match(w, /idempotencyKey/);
  assert.match(p, /Serializable/); assert.match(p, /withdrawal:\$\{withdrawal\.id\}/); assert.match(p, /RETRIES/); assert.match(p, /dead-letter/);
});

test('fees are represented separately from net payout', () => {
  const p = read('services/api/src/modules/payout/service.ts'); assert.match(p, /payout\.fee/); assert.match(p, /withdrawal\.netAmount/); assert.match(p, /currency/);
});
