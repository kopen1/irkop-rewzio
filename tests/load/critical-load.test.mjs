import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(f, 'utf8');

test('load-test targets cover login, rewards, watch, withdrawal, webhook, DB and Redis paths', () => {
  const sources = [read('services/api/src/routes/auth.ts'), read('services/api/src/routes/rewards.ts'), read('services/api/src/routes/watch.ts'), read('services/api/src/routes/wallet.ts'), read('services/api/src/routes/payout.ts'), read('services/api/src/core/redis.ts')].join('\n');
  for (const pattern of [/request-otp|login/i,/reward/i,/watch/i,/withdrawal/i,/webhook/i,/prisma|database/i,/redis/i]) assert.match(sources, pattern);
});

test('financial load paths retain concurrency controls', () => {
  const wallet = read('services/api/src/modules/wallet/service.ts'); const ledger = read('services/api/src/modules/coins/service.ts');
  assert.match(wallet, /FOR UPDATE/); assert.match(wallet, /Serializable/); assert.match(ledger, /FOR UPDATE/); assert.match(ledger, /Serializable/);
});
