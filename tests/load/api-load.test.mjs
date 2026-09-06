import test from 'node:test';
import assert from 'node:assert/strict';

const api = process.env.TEST_API_URL || 'http://127.0.0.1:3001';

async function hit(path) { const r = await fetch(`${api}${path}`); return r.status; }

test('load: concurrent health requests remain responsive', async () => {
  const paths = Array.from({ length: 40 }, () => '/health');
  const started = Date.now();
  const statuses = await Promise.all(paths.map(hit));
  const elapsed = Date.now() - started;
  assert.ok(statuses.every((s) => s === 200));
  assert.ok(elapsed < 10000, `health load exceeded 10s: ${elapsed}ms`);
});

test('load: concurrent protected reward requests preserve authorization', async () => {
  const statuses = await Promise.all(Array.from({ length: 40 }, () => hit('/api/v1/rewards')));
  assert.ok(statuses.every((s) => s === 401 || s === 403));
});
