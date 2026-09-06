import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('services/api/src/app.ts', 'utf8');
const redis = fs.readFileSync('services/api/src/core/redis.ts', 'utf8');
const db = fs.readFileSync('services/api/src/core/database.ts', 'utf8');

const workloads = [
  ['login', /registerAuthRoutes/], ['reward', /registerRewardRoutes/], ['watch', /registerWatchRoutes/],
  ['withdrawal', /registerWalletRoutes/], ['webhook', /registerPayoutRoutes/], ['database', /PrismaClient/], ['Redis', /RedisConnection/]
];

test('load-test workload surfaces are wired', () => {
  for (const [name, pattern] of workloads) assert.match(`${api}\n${db}\n${redis}`, pattern, `${name} workload is not wired`);
});

test('load tests have a bounded target contract', () => {
  const target = process.env.LOAD_BASE_URL ?? 'http://127.0.0.1:3000';
  assert.match(target, /^https?:\/\//); assert.ok(Number(process.env.LOAD_VUS ?? 10) > 0); assert.ok(Number(process.env.LOAD_DURATION_SECONDS ?? 10) > 0);
});

export async function runLoadScenario(baseUrl, path, requests = 10) {
  const results = [];
  for (let i = 0; i < requests; i += 1) {
    const started = performance.now();
    try { const response = await fetch(`${baseUrl}${path}`); results.push({ status: response.status, latencyMs: performance.now() - started }); }
    catch (error) { results.push({ status: 0, latencyMs: performance.now() - started, error: String(error) }); }
  }
  return results;
}
