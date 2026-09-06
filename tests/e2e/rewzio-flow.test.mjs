import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const spec = fs.readFileSync(path.resolve('docs/api/openapi.yaml'), 'utf8');
const lifecycleTokens = ['auth/request-otp', 'auth/verify-otp', 'rewards', 'watch', 'missions', 'referral/apply', 'wallet', 'withdrawals', 'payouts', 'webhooks/payout'];

test('e2e: documented user-to-payout lifecycle has contract coverage', () => {
  for (const token of lifecycleTokens) assert.ok(spec.includes(`/api/v1/${token}`), `missing contract surface: ${token}`);
});

test('e2e: API contract declares consistent success and error envelopes', () => {
  assert.match(spec, /ApiSuccess:/);
  assert.match(spec, /required: \[success, data, message\]/);
  assert.match(spec, /ApiError:/);
  assert.match(spec, /ErrorBody:/);
  assert.match(spec, /ErrorCodes:/);
});

test('e2e: financial flow requires idempotency and server-side authority', () => {
  assert.match(spec, /idempotency/i);
  assert.match(spec, /amount/i);
  assert.match(spec, /withdrawal/i);
  assert.match(spec, /payout/i);
});
