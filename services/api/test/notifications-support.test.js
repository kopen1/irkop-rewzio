import assert from 'node:assert/strict';
import test from 'node:test';
import { SupportService } from '../dist/modules/support/service.js';

test('support rejects path traversal and unsupported attachments before persistence', async () => {
  const db = { supportTickets: { findFirst: async () => ({ id: 't1', appId: 'a1', userId: 'u1', status: 'OPEN' }) } };
  const service = new SupportService(db);
  await assert.rejects(() => service.addAttachment({ appId: 'a1', userId: 'u1', ticketId: 't1', fileName: '../secret.txt', mimeType: 'text/plain', sizeBytes: 10, fileUrl: 'https://storage.example/a' }), /Invalid attachment/);
  await assert.rejects(() => service.addAttachment({ appId: 'a1', userId: 'u1', ticketId: 't1', fileName: 'a.exe', mimeType: 'application/x-msdownload', sizeBytes: 10, fileUrl: 'https://storage.example/a' }), /Unsupported attachment/);
});

test('support attachment enforces size limit', async () => {
  const db = { supportTickets: { findFirst: async () => ({ id: 't1', appId: 'a1', userId: 'u1', status: 'OPEN' }) } };
  const service = new SupportService(db);
  await assert.rejects(() => service.addAttachment({ appId: 'a1', userId: 'u1', ticketId: 't1', fileName: 'a.png', mimeType: 'image/png', sizeBytes: 10 * 1024 * 1024 + 1, fileUrl: 'https://storage.example/a' }), /10 MB/);
});

test('support admin authorization rejects inactive admin', async () => {
  const db = { adminUsers: { findFirst: async () => null } };
  const service = new SupportService(db);
  await assert.rejects(() => service.requireAdmin('not-admin'), /Admin authorization required/);
});

test('notification preferences and idempotency are isolated per user', async () => {
  const store = new Map();
  const redis = { get: async (k) => store.get(k) ?? null, set: async (k, v) => { store.set(k, v); } };
  const db = { systemLogs: { create: async () => ({}) }, notifications: { create: async ({ data }) => ({ id: 'n1', ...data }), update: async ({ data }) => ({ id: 'n1', ...data }) } };
  const { NotificationService } = await import('../dist/modules/notifications/service.js');
  const service = new NotificationService(db, redis);
  await service.updatePreferences('a1', 'u1', { push: false });
  assert.equal((await service.preferences('a1', 'u1')).push, false);
  assert.equal((await service.preferences('a1', 'u2')).push, true);
});
