import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const contract = fs.readFileSync('docs/api/openapi.yaml', 'utf8');
const app = fs.readFileSync('services/api/src/app.ts', 'utf8');
const routes = fs.readFileSync('services/api/src/routes/wallet.ts', 'utf8');
const payout = fs.readFileSync('services/api/src/routes/payout.ts', 'utf8');

const critical = [
  '/api/v1/auth/request-otp','/api/v1/user/me','/api/v1/user/devices','/api/v1/user/sessions',
  '/api/v1/rewards','/api/v1/rewards/claim','/api/v1/missions','/api/v1/watch','/api/v1/ads',
  '/api/v1/survey','/api/v1/offerwall','/api/v1/referral/apply','/api/v1/lucky/play','/api/v1/spin/play',
  '/api/v1/quiz','/api/v1/game/play','/api/v1/wallet','/api/v1/withdrawals','/api/v1/withdrawals/history',
  '/api/v1/support/tickets','/api/v1/notifications','/api/v1/webhooks/payout/{provider}'
];

test('OpenAPI exposes every critical integration surface', () => {
  assert.match(contract, /openapi: 3\.0\.3/);
  for (const path of critical) assert.ok(contract.includes(path), `contract missing ${path}`);
  assert.match(contract, /ApiSuccess/); assert.match(contract, /ApiError/); assert.match(contract, /bearerAuth/);
});

test('backend mounts Swagger UI and canonical contract', () => {
  assert.match(app, /openapiDocument/); assert.match(app, /\/api\/docs/); assert.match(app, /swagger/);
});

test('wallet, withdrawal and webhook routes are wired', () => {
  assert.match(app, /registerWalletRoutes/); assert.match(app, /registerPayoutRoutes/);
  assert.match(routes, /\/withdrawals/); assert.match(routes, /\/withdrawals\/:id/); assert.match(routes, /authenticateUser/);
  assert.match(payout, /\/webhooks\/payout\/:provider/); assert.match(payout, /x-signature/); assert.match(payout, /x-app-id/);
});

test('standard success and error envelopes are canonical', () => {
  const response = fs.readFileSync('services/api/src/middleware/response.ts', 'utf8');
  assert.match(response, /success: true/); assert.match(response, /data: T/); assert.match(response, /message: string \| null/);
  assert.match(contract, /enum: \[false\]/); assert.match(contract, /ErrorBody/);
});
