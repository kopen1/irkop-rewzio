import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';

const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL || process.env.REDIS_URL;
assert.ok(databaseUrl && redisUrl, 'test infrastructure URLs are required');

function psqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('psql', [databaseUrl, '-At', '-c', sql], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr || 'psql failed')));
  });
}
function pingRedis() { const url = new URL(redisUrl); return new Promise((resolve, reject) => { const socket = net.createConnection({ host: url.hostname, port: Number(url.port) || 6379 }); let buffer = ''; socket.once('error', reject); socket.on('data', (chunk) => { buffer += chunk.toString(); if (buffer.includes('\r\n')) { socket.end(); resolve(buffer.slice(0, buffer.indexOf('\r\n'))); } }); socket.on('connect', () => socket.write('*1\r\n$4\r\nPING\r\n')); }); }

test('load: concurrent PostgreSQL queries remain consistent', async () => {
  const results = await Promise.all(Array.from({ length: 50 }, (_, i) => psqlAsync(`SELECT ${i}::int`)));
  assert.equal(results.length, 50);
  assert.deepEqual(results.map(Number).sort((a, b) => a - b), Array.from({ length: 50 }, (_, i) => i));
});

test('load: concurrent Redis connections remain responsive', async () => {
  const results = await Promise.all(Array.from({ length: 50 }, pingRedis));
  assert.equal(results.length, 50);
  assert.ok(results.every((value) => value === '+PONG'));
});
