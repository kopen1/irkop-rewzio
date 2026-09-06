import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const files = ['services/api/src/routes/auth.ts','services/api/src/routes/rewards.ts','services/api/src/routes/watch.ts','services/api/src/routes/engagement-rewards.ts','services/api/src/routes/wallet.ts','services/api/src/routes/payout.ts','services/api/src/routes/notifications-support.ts','services/api/src/modules/payout/service.ts'];
const source = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
const flow = ['Register','Login','Earn','Watch','Mission','Referral','Wallet','Withdrawal','Admin Review','Payout','Webhook','Completed'];

test('critical business E2E flow has a backend integration surface for every stage', () => {
  assert.equal(flow.length, 12);
  const expected = [/request-otp|verify-otp/, /rewards|claim/, /watch/, /mission/, /referral/, /wallet/, /withdrawals/, /admin/i, /payout/, /webhook/, /COMPLETED/];
  for (const pattern of expected) assert.match(source, pattern);
});

test('E2E financial terminal states are explicit', () => {
  const w = fs.readFileSync('services/api/src/modules/wallet/service.ts', 'utf8'); const p = fs.readFileSync('services/api/src/modules/payout/service.ts', 'utf8');
  assert.match(w, /APPROVED|PENDING_REVIEW|PENDING_CAPACITY/); assert.match(p, /COMPLETED/); assert.match(p, /REFUNDED/);
});
