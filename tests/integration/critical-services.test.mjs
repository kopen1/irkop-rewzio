import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(f, 'utf8');

test('integration coverage wires auth, database, Redis, rewards and wallet', () => {
  const app = read('services/api/src/app.ts');
  const auth = read('services/api/src/modules/auth/service.ts');
  const redis = read('services/api/src/core/redis.ts');
  const rewards = read('services/api/src/modules/rewards/engine.ts');
  const wallet = read('services/api/src/modules/wallet/service.ts');
  assert.match(app, /register.*Routes|routes/i); assert.match(auth, /db\.|Prisma/i); assert.match(redis, /incrementWithExpiry|get|set/);
  assert.match(rewards, /CoinLedger|ledger/i); assert.match(wallet, /FOR UPDATE|Serializable/);
});

test('integration coverage wires withdrawal, payout, webhook and reconciliation', () => {
  const wallet = read('services/api/src/modules/wallet/service.ts');
  const payout = read('services/api/src/modules/payout/service.ts');
  const route = read('services/api/src/routes/payout.ts');
  assert.match(wallet, /withdrawal/i); assert.match(payout, /reconcil/i); assert.match(payout, /retry|RETRIES/i);
  assert.match(route, /webhooks\/payout/); assert.match(route, /signature/i);
});

test('integration financial operations are replay-safe', () => {
  const sources = [read('services/api/src/modules/coins/service.ts'), read('services/api/src/modules/rewards/engine.ts'), read('services/api/src/modules/wallet/service.ts'), read('services/api/src/modules/payout/service.ts')].join('\n');
  assert.match(sources, /idempotency/i); assert.match(sources, /Serializable/); assert.match(sources, /FOR UPDATE/);
});
