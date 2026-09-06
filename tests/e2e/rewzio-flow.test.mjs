import test from 'node:test';
import assert from 'node:assert/strict';

const api = process.env.TEST_API_URL || 'http://127.0.0.1:3001';
async function call(path, options = {}) { const r = await fetch(`${api}${path}`, options); let b = null; try { b = await r.json(); } catch {} return { r, b }; }

test('e2e: service health and API v1 entrypoint', async () => {
  const health = await call('/health');
  assert.equal(health.r.status, 200);
  assert.equal(health.b.success, true);
  const version = await call('/api/v1');
  assert.equal(version.r.status, 200);
  assert.equal(version.b.data.version, 'v1');
});

test('e2e: protected earning lifecycle begins with authenticated authorization', async () => {
  const steps = ['/api/v1/user/me', '/api/v1/rewards', '/api/v1/watch', '/api/v1/missions', '/api/v1/wallet', '/api/v1/withdrawals'];
  for (const path of steps) {
    const { r } = await call(path);
    assert.ok([401, 403].includes(r.status), `${path} must require authentication`);
  }
});

test('e2e: withdrawal cannot be initiated without authenticated user context', async () => {
  const { r } = await call('/api/v1/withdrawals', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'e2e-unauth' }, body: JSON.stringify({ amount: 10000, method: 'DANA', account: 'test' }) });
  assert.ok([400, 401, 403].includes(r.status));
});
