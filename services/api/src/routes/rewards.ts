import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../core/redis.js';
import type { AppConfig } from '../config/index.js';
import { ok } from '../middleware/response.js';
import { authenticateUser, type AccessClaims } from '../middleware/authentication.js';
import { DailyMissionService } from '../modules/rewards/daily-missions.js';

interface Req extends FastifyRequest { userClaims?: AccessClaims }
interface Body { idempotencyKey?: string; evidence?: Record<string, unknown>; appId?: string }
export function registerRewardRoutes(app: FastifyInstance, config: AppConfig, db: PrismaClient, redis: RedisConnection): void {
  const service = new DailyMissionService(db, redis);
  const auth = async (request: Req) => { const claims = await authenticateUser(request, db, config.jwtAccessSecret); request.userClaims = claims; return claims; };
  const checkApp = (bodyAppId: string | undefined, claims: AccessClaims) => { if (bodyAppId !== undefined && bodyAppId !== claims.appId) throw bad(403, 'APP_NOT_AUTHORIZED', 'Token is not authorized for this app'); };
  app.register(async (api) => {
    api.get('/rewards', async (request) => { const claims = await auth(request as Req); return ok(await service.rewards(claims.appId)); });
    api.get('/missions', async (request) => { const claims = await auth(request as Req); return ok(await service.missions(claims.appId, claims.sub)); });
    api.get<{ Params: { id: string } }>('/missions/:id', async (request) => { const claims = await auth(request as Req); return ok(await service.mission(claims.appId, claims.sub, request.params.id)); });
    api.post<{ Params: { id: string }; Body: Body }>('/missions/:id/start', async (request) => { const claims = await auth(request as Req); checkApp(request.body?.appId, claims); return ok(await service.startMission(claims.appId, claims.sub, request.params.id)); });
    api.post<{ Params: { id: string }; Body: Body }>('/missions/:id/complete', async (request) => { const claims = await auth(request as Req); checkApp(request.body?.appId, claims); if (!request.body?.idempotencyKey) throw bad(400, 'INVALID_IDEMPOTENCY_KEY', 'idempotencyKey is required'); return ok(await service.completeMission(claims.appId, claims.sub, claims.sid, request.params.id, request.body.idempotencyKey, request.body.evidence ?? {})); });
    api.post<{ Body: Body }>('/rewards/claim', async (request) => { const claims = await auth(request as Req); checkApp(request.body?.appId, claims); if (!request.body?.idempotencyKey) throw bad(400, 'INVALID_IDEMPOTENCY_KEY', 'idempotencyKey is required'); return ok(await service.claimDaily(claims.appId, claims.sub, claims.sid, request.body.idempotencyKey)); });
  }, { prefix: '/api/v1' });
}
function bad(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } { const e = new Error(message) as Error & { statusCode: number; code: string }; e.statusCode = statusCode; e.code = code; return e; }
