import test from 'node:test';
import assert from 'node:assert/strict';
import { CoinLedgerService } from '../dist/modules/coins/service.js';

function makeDb() {
  const accounts = new Map();
  const ledger = [];
  let sequence = 0;
  let queue = Promise.resolve();

  const tx = {
    coinAccounts: {
      upsert: async ({ where, create }) => {
        const key = `${where.appId_userId.appId}:${where.appId_userId.userId}`;
        if (!accounts.has(key)) accounts.set(key, { id: `a${accounts.size + 1}`, ...create });
        return accounts.get(key);
      },
      update: async ({ where, data }) => {
        const account = [...accounts.values()].find((x) => x.id === where.id);
        Object.assign(account, data);
        return account;
      },
      findUnique: async ({ where }) => accounts.get(`${where.appId_userId.appId}:${where.appId_userId.userId}`) ?? null,
    },
    coinLedger: {
      findUnique: async ({ where }) => ledger.find((x) => x.appId === where.appId_idempotencyKey.appId && x.idempotencyKey === where.appId_idempotencyKey.idempotencyKey) ?? null,
      create: async ({ data }) => {
        const row = { id: `l${++sequence}`, createdAt: new Date(), ...data };
        ledger.push(row);
        return row;
      },
    },
    $queryRaw: async (_query) => {
      const account = [...accounts.values()][0];
      return account ? [{ id: account.id, balance: account.balance, version: account.version }] : [];
    },
  };

  return {
    accounts,
    ledger,
    ...tx,
    $transaction: async (callback) => {
      const previous = queue;
      let release;
      queue = new Promise((resolve) => { release = resolve; });
      await previous;
      try { return await callback(tx); } finally { release(); }
    },
  };
}

const base = {
  appId: 'app1',
  userId: 'u1',
  transactionType: 'DAILY_REWARD',
  source: 'daily_reward',
};

test('credit creates immutable ledger entry and updates balance atomically', async () => {
  const db = makeDb();
  const service = new CoinLedgerService(db);
  const result = await service.creditCoins({ ...base, amount: 100n, idempotencyKey: 'credit-001' });
  assert.equal(result.balance, 100n);
  assert.equal(db.ledger.length, 1);
  assert.equal(db.ledger[0].balanceBefore, 0n);
  assert.equal(db.ledger[0].balanceAfter, 100n);
  assert.equal(db.ledger[0].amount, 100n);
});

test('debit reduces balance', async () => {
  const db = makeDb();
  const service = new CoinLedgerService(db);
  await service.creditCoins({ ...base, amount: 100n, idempotencyKey: 'credit-002' });
  const result = await service.debitCoins({ ...base, transactionType: 'WITHDRAWAL', source: 'withdrawal', amount: 40n, idempotencyKey: 'debit-001' });
  assert.equal(result.balance, 60n);
  assert.equal(db.ledger[1].amount, -40n);
});

test('insufficient balance is rejected and no ledger row is created', async () => {
  const db = makeDb();
  const service = new CoinLedgerService(db);
  await assert.rejects(() => service.debitCoins({ ...base, amount: 1n, idempotencyKey: 'debit-002' }), /Insufficient Rewzio Coin balance/);
  assert.equal(db.ledger.length, 0);
});

test('duplicate request is idempotent', async () => {
  const db = makeDb();
  const service = new CoinLedgerService(db);
  const first = await service.creditCoins({ ...base, amount: 25n, idempotencyKey: 'dup-0001' });
  const second = await service.creditCoins({ ...base, amount: 25n, idempotencyKey: 'dup-0001' });
  assert.equal(second.ledgerId, first.ledgerId);
  assert.equal(second.balance, 25n);
  assert.equal(db.ledger.length, 1);
});

test('replay with changed amount is rejected', async () => {
  const db = makeDb();
  const service = new CoinLedgerService(db);
  await service.creditCoins({ ...base, amount: 25n, idempotencyKey: 'replay-01' });
  await assert.rejects(() => service.creditCoins({ ...base, amount: 50n, idempotencyKey: 'replay-01' }), /Idempotency key was already used/);
  assert.equal(db.ledger.length, 1);
});

test('concurrent credits serialize and preserve final balance', async () => {
  const db = makeDb();
  const service = new CoinLedgerService(db);
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => service.creditCoins({ ...base, amount: 10n, idempotencyKey: `concurrent-${String(i).padStart(2, '0')}` })));
  assert.equal(results.at(-1).balance, 200n);
  assert.equal((await service.getBalance('app1', 'u1')).balance, 200n);
  assert.equal(db.ledger.length, 20);
});

test('ledger consistency: every entry chains balance before/after', async () => {
  const db = makeDb();
  const service = new CoinLedgerService(db);
  await service.creditCoins({ ...base, amount: 30n, idempotencyKey: 'cons-0001' });
  await service.creditCoins({ ...base, amount: 20n, idempotencyKey: 'cons-0002' });
  await service.debitCoins({ ...base, amount: 15n, idempotencyKey: 'cons-0003', transactionType: 'SPEND', source: 'purchase' });
  let balance = 0n;
  for (const row of db.ledger) {
    assert.equal(row.balanceBefore, balance);
    assert.equal(row.balanceAfter, row.balanceBefore + row.amount);
    balance = row.balanceAfter;
  }
  assert.equal(balance, 35n);
});

test('amount must be a backend integer and cannot be negative through credit API', async () => {
  const db = makeDb();
  const service = new CoinLedgerService(db);
  await assert.rejects(() => service.creditCoins({ ...base, amount: -5n, idempotencyKey: 'bad-0001' }), /positive integer/);
  assert.equal(db.ledger.length, 0);
});
