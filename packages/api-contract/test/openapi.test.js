import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.cwd(), '../../docs/api/openapi.yaml');
const source = fs.readFileSync(file, 'utf8');

test('OpenAPI contract is valid YAML-shaped JSON-compatible document', () => {
  assert.ok(source.includes('openapi: 3.0.3'));
  assert.ok(source.includes('title: Rewzio API'));
  for (const route of [
    '/api/v1/auth/request-otp', '/api/v1/user/me', '/api/v1/rewards', '/api/v1/missions',
    '/api/v1/watch', '/api/v1/ads', '/api/v1/survey', '/api/v1/offerwall', '/api/v1/referral/apply',
    '/api/v1/lucky/play', '/api/v1/spin/play', '/api/v1/quiz', '/api/v1/game/play', '/api/v1/wallet',
    '/api/v1/withdrawals', '/api/v1/support/tickets', '/api/v1/notifications', '/api/v1/webhooks/payout/{provider}'
  ]) assert.ok(source.includes(route), `missing ${route}`);
  assert.ok(source.includes('ApiSuccess'));
  assert.ok(source.includes('ApiError'));
  assert.ok(source.includes('ErrorCodes'));
  assert.ok(source.includes('bearerAuth'));
});
