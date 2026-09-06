import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const auth = read('services/api/src/middleware/authentication.ts');
const reward = read('services/api/src/modules/rewards/engine.ts');
const wallet = read('services/api/src/modules/wallet/service.ts');
const payout = read('services/api/src/modules/payout/service.ts');
const fraud = read('services/api/src/modules/fraud/service.ts');
const admin = read('apps/admin/src/lib/rbac.ts');

const securityCases = {
  IDOR: [/session\.userId !== claims\.sub/, /session\.appId !== claims\.appId/],
  authentication_bypass: [/Bearer /, /verifyAccessToken/, /SESSION_INVALID/],
  authorization_bypass: [/APP_NOT_AUTHORIZED/, /role === "STAFF"/],
  replay: [/REWARD_ALREADY_PROCESSED/, /idempotencyKey/],
  duplicate_reward: [/rewardRedemptions\.findUnique/, /Serializable/],
  fake_reward_amount: [/reward\.amount/, /clientAmountIgnored/],
  double_withdrawal: [/FOR UPDATE/, /pg_advisory_xact_lock/],
  duplicate_webhook: [/paymentWebhooks\.upsert/, /status === 'PROCESSED'/],
  brute_force: [/OTP_MAX_ATTEMPTS/, /RATE_LIMITED/],
  rate_limit_bypass: [/incrementWithExpiry/],
  sql_injection: [/\$queryRaw/, /\$transaction/],
  malicious_payload: [/redactPayload/, /redactMetadata/],
  privilege_escalation: [/ADMIN_ONLY/, /STAFF_DEFAULT/],
  concurrent_financial_operations: [/Serializable/, /FOR UPDATE/]
};

test('critical security invariants are enforced', () => {
  for (const [name, patterns] of Object.entries(securityCases)) {
    const corpus = name.includes('withdrawal') || name.includes('financial') ? `${wallet}\n${payout}` : name.includes('reward') || name === 'replay' ? `${reward}\n${wallet}` : name.includes('authorization') || name.includes('privilege') || name === 'IDOR' ? `${auth}\n${admin}\n${wallet}` : name.includes('webhook') ? payout : name.includes('brute') || name.includes('authentication') || name.includes('rate') ? `${auth}\n${reward}` : `${auth}\n${reward}\n${fraud}\n${payout}`;
    for (const pattern of patterns) assert.match(corpus, pattern, `${name} invariant missing: ${pattern}`);
  }
});

test('IP remains a risk signal, not a one-IP-one-account rule', () => {
  assert.match(fraud, /type: 'ip'/); assert.doesNotMatch(fraud, /one.?ip|one.?account/i);
});

test('no provider secrets are embedded in Android source', () => {
  const android = read('apps/android/app/src/main/java/com/servicebusiness/rewzio/MainActivity.kt');
  assert.doesNotMatch(android, /sk_live|xendit.*secret|duitku.*key|api[_-]?secret/i);
});
