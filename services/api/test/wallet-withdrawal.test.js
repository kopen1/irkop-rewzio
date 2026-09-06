import assert from 'node:assert/strict';
import test from 'node:test';
import { WalletWithdrawalService } from '../dist/modules/wallet/service.js';

function decimal(value) { return { toFixed: () => String(value) }; }

function dbStub({ coins = 2_000_000n, capacity = undefined } = {}) {
  const state = { coinBalance: coins, wallet: { locked: 0n, available: coins / 10n, version: 0n }, withdrawals: new Map() };
  let chain = Promise.resolve();
  const tx = {
    $queryRaw: async () => [{ balance: state.coinBalance }],
    wallets: {
      upsert: async () => ({ appId: 'a1', userId: 'u1', availableBalance: decimal(state.wallet.available), lockedBalance: decimal(state.wallet.locked), version: state.wallet.version }),
      update: async ({ data }) => { state.wallet.available = BigInt(data.availableBalance); state.wallet.locked = BigInt(data.lockedBalance); state.wallet.version += 1n; return { version: state.wallet.version }; },
    },
    withdrawals: {
      findMany: async () => Array.from(state.withdrawals.values()).map((w) => ({ userId: w.userId, amount: w.amount })),
      create: async ({ data }) => { const row = { id: `wd-${state.withdrawals.size + 1}`, ...data, amount: decimal(data.amount), fee: decimal(data.fee), netAmount: decimal(data.netAmount) }; state.withdrawals.set(data.idempotencyKey, row); return row; },
    },
  };
  const db = {
    appSettings: { findUnique: async () => capacity ? { value: capacity } : null },
    withdrawalMethods: { findFirst: async () => ({ id: 'm1', status: 'VERIFIED' }) },
    userSessions: { findUnique: async () => ({ id: 's1', status: 'ACTIVE', ipAddress: '10.0.0.1' }), count: async () => 1, findMany: async () => [{ userId: 'u1' }] },
    withdrawals: { findUnique: async ({ where }) => state.withdrawals.get(where.idempotencyKey) ?? null, count: async () => 0, findMany: async () => Array.from(state.withdrawals.values()) },
    userDevices: { findUnique: async () => ({ id: 'd1', riskScore: 0, integrityStatus: 'VERIFIED' }) },
    rewardRedemptions: { count: async () => 0, findMany: async () => [] },
    referrals: { findMany: async () => [] },
    deviceRelationships: { count: async () => 0 },
    fraudScores: { create: async ({ data }) => ({ id: 'fs1', ...data }) },
    fraudEvents: { create: async ({ data }) => ({ id: 'fe1', ...data }) },
    riskSignals: { createMany: async () => ({ count: 0 }) },
    securityActions: { create: async ({ data }) => ({ id: 'sa1', ...data }) },
    $transaction: async (fn) => { const previous = chain; let release; chain = new Promise((resolve) => { release = resolve; }); await previous; try { return await fn(tx); } finally { release(); } },
  };
  return { db, state };
}

const redis = { incrementWithExpiry: async () => 1 };
async function request(service, key, amount = 10000n) { return service.requestWithdrawal({ appId: 'a1', userId: 'u1', sessionId: 's1', methodId: 'm1', amount, idempotencyKey: key, deviceId: 'd1', ipAddress: '10.0.0.1' }); }

test('minimum withdrawal is Rp10.000', async () => { const { db } = dbStub(); const service = new WalletWithdrawalService(db, redis); await assert.rejects(() => request(service, 'minimum-1', 9999n), /Minimum withdrawal/); });

test('concurrent withdrawals lock balance atomically', async () => { const { db, state } = dbStub({ coins: 2_000_000n }); const service = new WalletWithdrawalService(db, redis); const results = await Promise.allSettled([request(service, 'concurrent-a', 150000n), request(service, 'concurrent-b', 150000n)]); assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1); assert.equal(results.filter((result) => result.status === 'rejected').length, 1); assert.equal(state.wallet.locked, 150000n); assert.equal(state.wallet.available, 50000n); assert.equal(state.withdrawals.size, 1); });

test('daily capacity produces PENDING_CAPACITY without releasing the lock', async () => { const { db, state } = dbStub({ coins: 500_000n, capacity: { enable_daily_limit: true, max_wd_users_per_day: 0, max_wd_transactions_per_day: 1, max_payout_amount_per_day: '0', max_wd_per_user_per_day: 0, max_wd_amount_per_user_per_day: '0', reset_time: '00:00' } }); const service = new WalletWithdrawalService(db, redis); await request(service, 'capacity-a', 10000n); const second = await request(service, 'capacity-b', 10000n); assert.equal(second.status, 'PENDING_CAPACITY'); assert.equal(state.wallet.locked, 20000n); assert.equal(state.wallet.available, 30000n); });

test('same idempotency key replays the same withdrawal without another lock', async () => { const { db, state } = dbStub({ coins: 500_000n }); const service = new WalletWithdrawalService(db, redis); const first = await request(service, 'replay-1', 10000n); const second = await request(service, 'replay-1', 10000n); assert.equal(first.id, second.id); assert.equal(state.withdrawals.size, 1); assert.equal(state.wallet.locked, 10000n); });
