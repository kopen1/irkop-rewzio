import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../dist/app.js';

const config = {
  nodeEnv: 'test',
  appName: 'rewzio-test',
  host: '127.0.0.1',
  port: 3001,
  databaseUrl: 'postgresql://test:test@localhost:5432/test',
  redisUrl: 'redis://localhost:6379',
  corsOrigin: '*',
  logLevel: 'silent',
};

const db = {
  $queryRaw: async () => [{ '?column?': 1 }],
};
const redis = { ping: async () => undefined };

test('health returns the standard success envelope', async () => {
  const app = buildApp(config, { db, redis });
  const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { success: true, data: { status: 'ok' }, message: null });
  assert.ok(response.headers['x-request-id']);
  await app.close();
});

test('readiness reports database and redis status', async () => {
  const app = buildApp(config, { db, redis });
  const response = await app.inject({ method: 'GET', url: '/api/v1/ready' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    success: true,
    data: { status: 'ready', dependencies: { database: true, redis: true } },
    message: null,
  });
  await app.close();
});

test('unknown routes use the standard error envelope without stack traces', async () => {
  const app = buildApp(config, { db, redis });
  const response = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
  assert.equal(response.body.includes('stack'), false);
  await app.close();
});
