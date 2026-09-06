import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { MockPayoutProvider, createPayoutProvider } from '../dist/modules/payout/provider.js';

test('payout mode defaults to MOCK outside production', () => {
  const previousMode = process.env.PAYOUT_MODE;
  const previousEnv = process.env.NODE_ENV;
  delete process.env.PAYOUT_MODE;
  process.env.NODE_ENV = 'test';
  assert.equal(createPayoutProvider().code, 'MOCK');
  if (previousMode === undefined) delete process.env.PAYOUT_MODE; else process.env.PAYOUT_MODE = previousMode;
  if (previousEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv;
});

test('MOCK payout provider is rejected in production', () => {
  const previousMode = process.env.PAYOUT_MODE;
  const previousEnv = process.env.NODE_ENV;
  delete process.env.PAYOUT_MODE;
  process.env.NODE_ENV = 'production';
  assert.throws(() => createPayoutProvider(), /not permitted in production/);
  if (previousMode === undefined) delete process.env.PAYOUT_MODE; else process.env.PAYOUT_MODE = previousMode;
  if (previousEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnv;
});

test('mock provider requires configured webhook secret and verifies signatures', () => {
  const previous = process.env.PAYOUT_WEBHOOK_SECRET;
  delete process.env.PAYOUT_WEBHOOK_SECRET;
  const provider = new MockPayoutProvider();
  const payload = JSON.stringify({ eventId: 'evt-1', providerReference: 'MOCK-p1', status: 'COMPLETED' });
  assert.equal(provider.verifyWebhook('anything', payload), false);
  process.env.PAYOUT_WEBHOOK_SECRET = 'test-secret';
  const signature = crypto.createHmac('sha256', 'test-secret').update(payload).digest('hex');
  assert.equal(provider.verifyWebhook(signature, payload), true);
  assert.equal(provider.verifyWebhook('bad', payload), false);
  if (previous === undefined) delete process.env.PAYOUT_WEBHOOK_SECRET; else process.env.PAYOUT_WEBHOOK_SECRET = previous;
});

test('duplicate-safe generic webhook parser normalizes provider status', () => {
  const provider = new MockPayoutProvider();
  assert.deepEqual(provider.parseWebhook({ eventId: 'evt-1', providerReference: 'ref-1', status: 'success' }), { eventId: 'evt-1', eventType: 'payout.update', providerReference: 'ref-1', status: 'COMPLETED' });
  assert.deepEqual(provider.parseWebhook({ event_id: 'evt-2', reference: 'ref-2', status: 'failed' }).status, 'FAILED');
});
