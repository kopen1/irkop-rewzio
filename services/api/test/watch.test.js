import test from 'node:test';
import assert from 'node:assert/strict';
import { WatchService } from '../dist/modules/watch/service.js';

test('watch service exposes required operations', () => {
  assert.equal(typeof WatchService.prototype.list, 'function');
  assert.equal(typeof WatchService.prototype.start, 'function');
  assert.equal(typeof WatchService.prototype.heartbeat, 'function');
  assert.equal(typeof WatchService.prototype.complete, 'function');
});

test('fake completion cannot bypass minimum watch requirement', async () => {
  const now = new Date(Date.now() - 120_000);
  const db = {
    userSessions: { findUnique: async () => ({ id: 'auth1', appId: 'a1', userId: 'u1', deviceId: 'd1', status: 'ACTIVE', expiresAt: new Date(Date.now() + 60_000) }) },
    userDevices: { findUnique: async () => ({ id: 'd1', appId: 'a1', userId: 'u1', status: 'ACTIVE', integrityStatus: 'VERIFIED', riskScore: 0 }) },
    watchSessions: { findUnique: async () => ({ id: 'w1', appId: 'a1', userId: 'u1', deviceId: 'd1', startedAt: now, watchedSeconds: 2, lastHeartbeatAt: new Date(), status: 'IN_PROGRESS', watchContent: { durationSeconds: 60, minimumWatchSeconds: 30 } }) },
    watchEvents: { count: async () => 0 },
  };
  const redis = { incrementWithExpiry: async () => 1 };
  const service = new WatchService(db, redis);
  await assert.rejects(() => service.complete('a1', 'u1', 'auth1', 'w1', 'complete-1234'), /Minimum watch requirement/);
});

test('rapid completion is rejected even when client reports enough watch time', async () => {
  const now = new Date();
  const db = {
    userSessions: { findUnique: async () => ({ id: 'auth1', appId: 'a1', userId: 'u1', deviceId: 'd1', status: 'ACTIVE', expiresAt: new Date(Date.now() + 60_000) }) },
    userDevices: { findUnique: async () => ({ id: 'd1', appId: 'a1', userId: 'u1', status: 'ACTIVE', integrityStatus: 'VERIFIED', riskScore: 0 }) },
    watchSessions: { findUnique: async () => ({ id: 'w1', appId: 'a1', userId: 'u1', deviceId: 'd1', startedAt: now, watchedSeconds: 30, lastHeartbeatAt: new Date(), status: 'IN_PROGRESS', watchContent: { durationSeconds: 60, minimumWatchSeconds: 30 } }) },
    watchEvents: { count: async () => 1 },
  };
  const redis = { incrementWithExpiry: async () => 1 };
  const service = new WatchService(db, redis);
  await assert.rejects(() => service.complete('a1', 'u1', 'auth1', 'w1', 'rapid-1234'), /Watch completed too quickly/);
});
