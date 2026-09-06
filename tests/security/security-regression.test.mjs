import test from 'node:test';
import assert from 'node:assert/strict';

const api = process.env.TEST_API_URL || 'http://127.0.0.1:3001';

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, { redirect: 'manual', ...options });
  let body = null;
  try { body = await response.json(); } catch {}
  return { response, body };
}

test('security: protected endpoints reject unauthenticated access', async () => {
  const paths = ['/api/v1/user/me', '/api/v1/wallet', '/api/v1/withdrawals', '/api/v1/notifications', '/api/v1/support/tickets'];
  for (const path of paths) {
    const { response } = await request(path);
    assert.ok([401, 403].includes(response.status), `${path} returned ${response.status}`);
  }
});

test('security: IDOR attempts do not bypass authentication', async () => {
  for (const path of ['/api/v1/user/devices/other-user-device', '/api/v1/user/sessions/other-user-session', '/api/v1/withdrawals/other-user-withdrawal']) {
    const { response } = await request(path, { method: 'DELETE' });
    assert.ok([401, 403, 404].includes(response.status), `${path} returned ${response.status}`);
  }
});

test('security: malformed and injection payloads are rejected safely', async () => {
  const payload = { phone: "' OR 1=1 --", amount: "999999999999999999999999999999999999" };
  const { response, body } = await request('/api/v1/auth/request-otp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  assert.ok(response.status >= 400 && response.status < 500);
  assert.equal(body?.success, false);
  assert.equal(typeof body?.error?.message, 'string');
  assert.equal(body?.error?.stack, undefined);
});

test('security: privilege escalation cannot grant admin without credentials', async () => {
  const { response } = await request('/api/v1/admin/users', { method: 'GET', headers: { 'x-role': 'ADMIN', 'x-permission': 'users.view' } });
  assert.ok([401, 403, 404].includes(response.status));
});

test('security: webhook without authentication is rejected', async () => {
  const { response } = await request('/api/v1/webhook/payout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'replay-test', status: 'COMPLETED' }) });
  assert.ok([400, 401, 403, 404].includes(response.status));
});
