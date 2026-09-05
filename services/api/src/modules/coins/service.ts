import type { Prisma, PrismaClient } from '@prisma/client';

const COINS_PER_IDR = 10n;
const MAX_COIN_AMOUNT = 9_000_000_000_000_000_000n;

type LedgerStatus = 'PENDING' | 'CONFIRMED' | 'REVERSED' | 'VOID';

type LedgerInput = {
  userId: string;
  appId: string;
  transactionType: string;
  source: string;
  amount: bigint;
  referenceId?: string;
  status?: LedgerStatus;
  metadata?: unknown;
  idempotencyKey?: string;
};

type BalanceResult = { userId: string; appId: string; balance: bigint };

type ExistingLedger = {
  id: string;
  userId: string;
  appId: string;
  transactionType: string;
  source: string;
  amount: bigint;
  referenceId: string | null;
  balanceAfter: bigint;
};

/** Rewzio Coin: 10 coins = Rp1. Ledger is the financial source of truth. */
export class CoinLedgerService {
  constructor(private readonly db: PrismaClient) {}

  async creditCoins(input: Omit<LedgerInput, 'amount'> & { amount: bigint }): Promise<BalanceResult & { ledgerId: string }> {
    const amount = positiveAmount(input.amount);
    return this.applyDelta({ ...input, amount, transactionType: input.transactionType || 'CREDIT' });
  }

  async debitCoins(input: Omit<LedgerInput, 'amount'> & { amount: bigint }): Promise<BalanceResult & { ledgerId: string }> {
    const amount = positiveAmount(input.amount);
    return this.applyDelta({ ...input, amount: -amount, transactionType: input.transactionType || 'DEBIT' });
  }

  async getBalance(appId: string, userId: string): Promise<BalanceResult> {
    const account = await this.db.coinAccounts.findUnique({ where: { appId_userId: { appId, userId } } });
    return { userId, appId, balance: account?.balance ?? 0n };
  }

  async createLedgerEntry(input: LedgerInput): Promise<BalanceResult & { ledgerId: string }> {
    if (input.amount === 0n) throw coinError('INVALID_COIN_AMOUNT', 'Coin amount cannot be zero', 400);
    return this.applyDelta(input);
  }

  private async applyDelta(input: LedgerInput): Promise<BalanceResult & { ledgerId: string }> {
    validateInput(input);

    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const account = await tx.coinAccounts.upsert({
        where: { appId_userId: { appId: input.appId, userId: input.userId } },
        create: { appId: input.appId, userId: input.userId, balance: 0n, version: 0n },
        update: {},
      });

      const locked = await tx.$queryRaw<Array<{ id: string; balance: bigint; version: bigint }>>`
        SELECT "id", "balance", "version"
        FROM "coin_accounts"
        WHERE "id" = ${account.id}
          AND "appId" = ${input.appId}
          AND "userId" = ${input.userId}
        FOR UPDATE
      `;
      if (locked.length !== 1) throw coinError('COIN_ACCOUNT_NOT_FOUND', 'Coin account not found', 404);

      const current = locked[0];
      if (input.idempotencyKey) {
        const existing = await tx.coinLedger.findUnique({
          where: { appId_idempotencyKey: { appId: input.appId, idempotencyKey: input.idempotencyKey } },
        });
        if (existing) {
          if (!sameLedgerRequest(existing, input)) {
            throw coinError('IDEMPOTENCY_CONFLICT', 'Idempotency key was already used for a different transaction', 409);
          }
          return { userId: input.userId, appId: input.appId, balance: existing.balanceAfter, ledgerId: existing.id };
        }
      }

      const nextBalance = current.balance + input.amount;
      if (nextBalance < 0n) throw coinError('INSUFFICIENT_COIN_BALANCE', 'Insufficient Rewzio Coin balance', 409);
      if (nextBalance > MAX_COIN_AMOUNT) throw coinError('COIN_BALANCE_LIMIT', 'Coin balance exceeds the allowed limit', 400);

      const ledger = await tx.coinLedger.create({
        data: {
          appId: input.appId,
          userId: input.userId,
          transactionType: input.transactionType,
          source: input.source,
          amount: input.amount,
          referenceId: input.referenceId,
          balanceBefore: current.balance,
          balanceAfter: nextBalance,
          status: input.status ?? 'CONFIRMED',
          metadata: input.metadata === undefined ? undefined : JSON.parse(JSON.stringify(input.metadata)),
          idempotencyKey: input.idempotencyKey,
        },
      });

      await tx.coinAccounts.update({
        where: { id: current.id },
        data: { balance: nextBalance, version: current.version + 1n },
      });

      return { userId: input.userId, appId: input.appId, balance: nextBalance, ledgerId: ledger.id };
    }, { isolationLevel: 'Serializable' });
  }
}

function positiveAmount(value: bigint): bigint {
  if (typeof value !== 'bigint' || value <= 0n || value > MAX_COIN_AMOUNT) {
    throw coinError('INVALID_COIN_AMOUNT', 'Coin amount must be a positive integer', 400);
  }
  return value;
}

function validateInput(input: LedgerInput): void {
  if (!input.userId || !input.appId || !input.transactionType || !input.source) {
    throw coinError('INVALID_LEDGER_INPUT', 'userId, appId, transactionType and source are required', 400);
  }
  if (typeof input.amount !== 'bigint' || input.amount === 0n || input.amount > MAX_COIN_AMOUNT || input.amount < -MAX_COIN_AMOUNT) {
    throw coinError('INVALID_COIN_AMOUNT', 'Coin amount is outside the allowed range', 400);
  }
  if (input.idempotencyKey !== undefined && (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 255)) {
    throw coinError('INVALID_IDEMPOTENCY_KEY', 'Invalid idempotency key', 400);
  }
}

function sameLedgerRequest(existing: ExistingLedger, input: LedgerInput): boolean {
  return existing.userId === input.userId &&
    existing.appId === input.appId &&
    existing.transactionType === input.transactionType &&
    existing.source === input.source &&
    existing.amount === input.amount &&
    existing.referenceId === (input.referenceId ?? null);
}

function coinError(code: string, message: string, statusCode = 500): Error & { code: string; statusCode: number } {
  const error = new Error(message) as Error & { code: string; statusCode: number };
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export { COINS_PER_IDR };
