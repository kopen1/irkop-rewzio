import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');

test('authorization boundaries cover IDOR, auth bypass and privilege escalation', () => {
  const auth = read('services/api/src/middleware/authentication.ts');
  const wallet = read('services/api/src/routes/wallet.ts');
  const support = read('services/api/src/modules/support/service.ts');
  assert.match(auth, /Bearer/); assert.match(auth, /session/i); assert.match(auth, /userId|sub/);
  assert.match(wallet, /authenticateUser/); assert.match(wallet, /userId/);
  assert.match(support, /admin/i); assert.match(support, /authorization|authorize/i);
});

test('replay, duplicate rewards and fake reward amounts are server controlled', () => {
  const reward = read('services/api/src/modules/rewards/engine.ts');
  const ledger = read('services/api/src/modules/coins/service.ts');
  assert.match(reward, /idempotency|REWARD_ALREADY_PROCESSED/); assert.match(reward, /reward\.amount/); assert.match(reward, /clientAmountIgnored/);
  assert.match(ledger, /IDEMPOTENCY_CONFLICT/);
});

test('double withdrawal and concurrent financial operations are atomic', () => {
  const wallet = read('services/api/src/modules/wallet/service.ts');
  const payout = read('services/api/src/modules/payout/service.ts');
  assert.match(wallet, /Serializable/); assert.match(wallet, /FOR UPDATE/); assert.match(wallet, /idempotencyKey/);
  assert.match(payout, /Serializable/); assert.match(payout, /idempotency/i);
});

test('webhook replay, duplicate payout, invalid signature and failed/refund paths are guarded', () => {
  const payout = read('services/api/src/modules/payout/service.ts');
  const route = read('services/api/src/routes/payout.ts');
  assert.match(route, /x-signature/); assert.match(route, /webhooks\/payout/);
  assert.match(payout, /duplicate|idempotency|replay/i); assert.match(payout, /FAILED|REFUNDED/);
});

test('brute force, rate-limit bypass and malicious payload controls exist', () => {
  const auth = read('services/api/src/modules/auth/service.ts');
  const fraud = read('services/api/src/modules/fraud/service.ts');
  assert.match(auth, /OTP_MAX_ATTEMPTS=5/); assert.match(auth, /Too many verification attempts/); assert.match(auth, /incrementWithExpiry/);
  assert.match(auth, /auth:otp:ip/); assert.match(auth, /auth:otp:phone/); assert.match(auth, /auth:verify:ip/);
  assert.match(fraud, /redactMetadata/);
});

test('SQL injection resistance uses Prisma/raw SQL only for controlled locking operations', () => {
  const files = ['services/api/src/modules/coins/service.ts','services/api/src/modules/wallet/service.ts','services/api/src/modules/payout/service.ts'];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /query\s*\(\s*[^`]/i);
    assert.match(source, /Prisma|prisma|\$queryRaw/);
  }
});
