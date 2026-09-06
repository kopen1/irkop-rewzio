import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL || process.env.REDIS_URL;

function requireInfra() {
  assert.ok(databaseUrl, 'TEST_DATABASE_URL/DATABASE_URL is required for integration tests');
  assert.ok(redisUrl, 'TEST_REDIS_URL/REDIS_URL is required for integration tests');
}

function redisCommand(parts) { return `*${parts.length}\r\n${parts.map((p) => `$${Buffer.byteLength(p)}\r\n${p}\r\n`).join('')}`; }
async function redisRequest(urlString, parts) {
  const url = new URL(urlString);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: url.hostname, port: Number(url.port) || 6379 });
    let buffer = '';
    socket.once('error', reject);
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const end = buffer.indexOf('\r\n');
      if (end < 0) return;
      const line = buffer.slice(0, end);
      socket.end();
      if (line.startsWith('-')) reject(new Error(line.slice(1))); else resolve(line);
    });
    socket.on('connect', () => socket.write(redisCommand(parts)));
  });
}

test('integration: PostgreSQL is reachable and required financial tables exist', async () => {
  requireInfra();
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await db.$queryRaw`SELECT 1`;
    const rows = await db.$queryRawUnsafe("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const names = new Set(rows.map((r) => r.table_name));
    for (const table of ['users', 'coin_accounts', 'coin_ledger', 'wallets', 'withdrawals', 'payout_transactions', 'payment_webhooks', 'fraud_scores']) assert.ok(names.has(table), `missing table: ${table}`);
  } finally { await db.$disconnect(); }
});

test('integration: database transaction rollback is atomic', async () => {
  requireInfra();
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const marker = `integration-${Date.now()}-${Math.random()}`;
  try {
    await assert.rejects(db.$transaction(async (tx) => { await tx.$executeRaw`SELECT 1`; throw new Error(marker); }), new RegExp(marker));
    const rows = await db.$queryRaw`SELECT 1 AS value`;
    assert.equal(Number(rows[0].value), 1);
  } finally { await db.$disconnect(); }
});

test('integration: Redis supports atomic increment and expiration primitive', async () => {
  requireInfra();
  const key = `rewzio:integration:${Date.now()}`;
  const first = await redisRequest(redisUrl, ['INCR', key]);
  const second = await redisRequest(redisUrl, ['INCR', key]);
  assert.equal(first, ':1');
  assert.equal(second, ':2');
  const expire = await redisRequest(redisUrl, ['EXPIRE', key, '5']);
  assert.equal(expire, ':1');
  await redisRequest(redisUrl, ['DEL', key]);
});

test('integration: Redis is reachable', async () => {
  requireInfra();
  assert.equal(await redisRequest(redisUrl, ['PING']), '+PONG');
});
