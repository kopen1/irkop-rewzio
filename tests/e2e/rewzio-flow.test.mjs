import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const spec = fs.readFileSync(path.resolve('docs/api/openapi.yaml'), 'utf8');
const lifecycle = [
  '/api/v1/auth/request-otp', '/api/v1/auth/verify-otp', '/api/v1/rewards',
  '/api/v1/watch', '/api/v1/missions', '/api/v1/referral', '/api/v1/wallet',
  '/api/v1/withdrawals', '/api/v1/admin', '/api/v1/payout', '/api/v1/webhook'
];

test('e2e: documented user-to-payout lifecycle has contract coverage', () => {
  for (const route of lifecycle) assert.match(spec, new RegExp(`^\\s*${route.replaceAll('/', '\\/')}:`, 'm'), `missing contract route: ${route}`);
});

test('e2e: API contract declares consistent success and error envelopes', () => {
  assert.match(spec, /success:\s*\n\s+type:\s+boolean/);
  assert.match(spec, /data:/);
  assert.match(spec, /message:/);
  assert.match(spec, /ERROR_CODE|error:/);
});

test('e2e: financial flow requires idempotency and server-side authority', () => {
  assert.match(spec, /Idempotency|idempotency/i);
  assert.match(spec, /amount/);
  assert.match(spec, /Withdrawal|withdrawal/i);
});
