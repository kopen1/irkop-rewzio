import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import net from 'node:net';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL || process.env.REDIS_URL;
assert.ok(databaseUrl && redisUrl, 'test infrastructure URLs are required');

function psql(sql) {
  const result = spawnSync('psql', [databaseUrl, '-At', '-c', sql], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'psql failed');
  return result.stdout.trim().split('\n').filter(Boolean);
}
function redisCommand(parts) { return `*${parts.length}\r\n${parts.map((p) => `$${Buffer.byteLength(p)}\r\n${p}\r\n`).join('')}`; }
async function redisRequest(parts) {
  const url = new URL(redisUrl);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: url.hostname, port: Number(url.port) || 6379 });
    let buffer = '';
    socket.once('error', reject);
    socket.on('data', (chunk) => { buffer += chunk.toString(); const end = buffer.indexOf('\r\n'); if (end < 0) return; const line = buffer.slice(0, end); socket.end(); if (line.startsWith('-')) reject(new Error(line.slice(1))); else resolve(line); });
    socket.on('connect', () => socket.write(redisCommand(parts)));
  });
}

test('integration: PostgreSQL is reachable and required financial tables exist', () => {
  const names = new Set(psql("SELECT table_name FROM information_schema.tables WHERE table_schema='public'"));
  for (const table of ['users', 'coin_accounts', 'coin_ledger', 'wallets', 'withdrawals', 'payout_transactions', 'payment_webhooks', 'fraud_scores']) assert.ok(names.has(table), `missing table: ${table}`);
});

test('integration: PostgreSQL transaction rollback is atomic', () => {
  const before = psql('SELECT count(*) FROM users')[0];
  assert.throws(() => psql("BEGIN; CREATE TEMP TABLE rewzio_atomic_probe(value int); INSERT INTO rewzio_atomic_probe VALUES (1); ROLLBACK; SELECT 1/0;"));
  assert.equal(psql('SELECT count(*) FROM users')[0], before);
});

test('integration: Redis supports atomic increment and expiration primitive', async () => {
  const key = `rewzio:integration:${Date.now()}`;
  assert.equal(await redisRequest(['DEL', key]), ':0');
  assert.equal(await redisRequest(['INCR', key]), ':1');
  assert.equal(await redisRequest(['INCR', key]), ':2');
  assert.equal(await redisRequest(['EXPIRE', key, '5']), ':1');
  await redisRequest(['DEL', key]);
});

test('integration: Redis is reachable', async () => { assert.equal(await redisRequest(['PING']), '+PONG'); });
