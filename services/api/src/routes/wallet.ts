import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../core/redis.js';
import type { AppConfig } from '../config/index.js';
import { ok } from '../middleware/response.js';
import { authenticateUser, type AccessClaims } from '../middleware/authentication.js';
import { WalletWithdrawalService } from '../modules/wallet/service.js';

interface Req extends FastifyRequest { userClaims?: AccessClaims }
interface Body { appId?: string; methodId?: string; amount?: string | number; idempotencyKey?: string; deviceId?: string }

export function registerWalletRoutes(app: FastifyInstance, config: AppConfig, db: PrismaClient, redis: RedisConnection): void {
  const service = new WalletWithdrawalService(db, redis);
  const auth = async (request: Req) => { const claims = await authenticateUser(request, db, config.jwtAccessSecret); request.userClaims = claims; return claims; };
  const checkApp = (bodyAppId: string | undefined, claims: AccessClaims) => { if (bodyAppId !== undefined && bodyAppId !== claims.appId) throw bad(403, 'APP_NOT_AUTHORIZED', 'Token is not authorized for this app'); };
  app.register(async (api) => {
    api.get('/wallet', async (request) => { const claims = await auth(request as Req); return ok(await service.getWallet(claims.appId, claims.sub)); });
    api.get('/withdrawals', async (request) => { const claims = await auth(request as Req); return ok(await service.listWithdrawals(claims.appId, claims.sub)); });
    api.get<{ Params: { id: string } }>('/withdrawals/:id', async (request) => { const claims = await auth(request as Req); return ok(await service.getWithdrawal(claims.appId, claims.sub, request.params.id)); });
    api.get('/withdrawals/history', async (request) => { const claims = await auth(request as Req); return ok(await service.listWithdrawals(claims.appId, claims.sub, true)); });
    api.post<{ Body: Body }>('/withdrawals', async (request) => {
      const claims = await auth(request as Req); checkApp(request.body?.appId, claims);
      const body = request.body ?? {};
      if (!body.methodId || body.amount === undefined || !body.idempotencyKey) throw bad(400, 'INVALID_WITHDRAWAL', 'methodId, amount and idempotencyKey are required');
      const amount = parseWholeAmount(body.amount);
      const input: { appId: string; userId: string; sessionId: string; methodId: string; amount: bigint; idempotencyKey: string; ipAddress: string; deviceId?: string } = { appId: claims.appId, userId: claims.sub, sessionId: claims.sid, methodId: body.methodId, amount, idempotencyKey: body.idempotencyKey, ipAddress: request.ip };
      if (body.deviceId !== undefined) input.deviceId = body.deviceId;
      return ok(await service.requestWithdrawal(input), 'Withdrawal request accepted');
    });
  }, { prefix: '/api/v1' });
}
function parseWholeAmount(value: string | number): bigint { const text = typeof value === 'number' ? String(value) : value.trim(); if (!/^\d+$/.test(text)) throw bad(400, 'INVALID_WITHDRAWAL_AMOUNT', 'amount must be a positive whole IDR amount'); const amount = BigInt(text); if (amount <= 0n) throw bad(400, 'INVALID_WITHDRAWAL_AMOUNT', 'amount must be a positive whole IDR amount'); return amount; }
function bad(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } { const e = new Error(message) as Error & { statusCode: number; code: string }; e.statusCode = statusCode; e.code = code; return e; }
