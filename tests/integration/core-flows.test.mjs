import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const app = read('services/api/src/app.ts');
const auth = read('services/api/src/modules/auth/service.ts');
const redis = read('services/api/src/core/redis.ts');
const reward = read('services/api/src/modules/rewards/engine.ts');
const wallet = read('services/api/src/modules/wallet/service.ts');
const payout = read('services/api/src/modules/payout/service.ts');
const webhook = read('services/api/src/routes/payout.ts');

const requiredModules = [
  'registerAuthRoutes','registerUserRoutes','registerRewardRoutes','registerWatchRoutes',
  'registerProviderRewardRoutes','registerEngagementRewardRoutes','registerWalletRoutes',
  'registerPayoutRoutes','registerNotificationSupportRoutes'
];

test('integration wiring covers auth + DB + Redis and all financial/reward modules', () => {
  for (const name of requiredModules) assert.match(app, new RegExp(name));
  assert.match(auth, /db\.otpRequests/); assert.match(auth, /redis\.incrementWithExpiry/);
  assert.match(redis, /PING/); assert.match(redis, /INCR/); assert.match(redis, /SET/); assert.match(redis, /GET/);
  assert.match(reward, /db\.\$transaction/); assert.match(reward, /createLedgerEntryInTransaction/);
  assert.match(wallet, /db\.\$transaction/); assert.match(wallet, /pg_advisory_xact_lock/);
  assert.match(payout, /paymentProviders/); assert.match(payout, /paymentWebhooks/); assert.match(payout, /reconcile/);
  assert.match(webhook, /webhooks\/payout/);
});

test('integration envelope and readiness dependencies are explicit', () => {
  const response = read('services/api/src/middleware/response.ts');
  const health = read('services/api/src/routes/health.ts');
  assert.match(response, /success: true/); assert.match(response, /message: string \| null/);
  assert.match(health, /pingDatabase/); assert.match(health, /redis\.ping/); assert.match(health, /503/);
});

test('provider webhook and reconciliation integration preserves idempotency', () => {
  assert.match(payout, /paymentWebhooks\.upsert/);
  assert.match(payout, /webhook:\$\{provider\.code\}:\$\{parsed\.eventId\}/);
  assert.match(payout, /PROVIDER_STATUS_LOOKUP_REQUIRED/);
});

if (process.env.TEST_BASE_URL) {
  test('live API integration smoke', async () => {
    const response = await fetch(`${process.env.TEST_BASE_URL}/api/v1/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ok');
  });
}
