import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../core/redis.js';
import type { AppConfig } from '../config/index.js';
import { ok } from '../middleware/response.js';
import { authenticateUser, type AccessClaims } from '../middleware/authentication.js';
import { WatchService } from '../modules/watch/service.js';

interface Req extends FastifyRequest { userClaims?: AccessClaims }
interface Body { appId?: string; contentId?: string; deviceId?: string; watchSessionId?: string; idempotencyKey?: string; positionSeconds?: number; metadata?: unknown }

export function registerWatchRoutes(app: FastifyInstance, config: AppConfig, db: PrismaClient, redis: RedisConnection): void {
  const service = new WatchService(db, redis);
  const auth = async (request: Req) => { const claims = await authenticateUser(request, db, config.jwtAccessSecret); request.userClaims = claims; return claims; };
  const checkApp = (bodyAppId: string | undefined, claims: AccessClaims) => { if (bodyAppId !== undefined && bodyAppId !== claims.appId) throw bad(403, 'APP_NOT_AUTHORIZED', 'Token is not authorized for this app'); };
  app.register(async (api) => {
    api.get('/watch', async (request) => { const claims = await auth(request as Req); return ok(await service.list(claims.appId)); });
    api.post<{ Body: Body }>('/watch/session', async (request) => {
      const claims = await auth(request as Req); checkApp(request.body?.appId, claims);
      if (!request.body?.contentId || !request.body.idempotencyKey) throw bad(400, 'INVALID_WATCH_SESSION', 'contentId and idempotencyKey are required');
      return ok(await service.start(claims.appId, claims.sub, claims.sid, request.body.contentId, request.body.deviceId ?? null, request.body.idempotencyKey));
    });
    api.post<{ Body: Body }>('/watch/heartbeat', async (request) => {
      const claims = await auth(request as Req); checkApp(request.body?.appId, claims);
      if (!request.body?.watchSessionId || request.body.positionSeconds === undefined) throw bad(400, 'INVALID_HEARTBEAT', 'watchSessionId and positionSeconds are required');
      return ok(await service.heartbeat(claims.appId, claims.sub, claims.sid, request.body.watchSessionId, request.body.positionSeconds, request.body.metadata));
    });
    api.post<{ Body: Body }>('/watch/complete', async (request) => {
      const claims = await auth(request as Req); checkApp(request.body?.appId, claims);
      if (!request.body?.watchSessionId || !request.body.idempotencyKey) throw bad(400, 'INVALID_COMPLETION', 'watchSessionId and idempotencyKey are required');
      return ok(await service.complete(claims.appId, claims.sub, claims.sid, request.body.watchSessionId, request.body.idempotencyKey));
    });
  }, { prefix: '/api/v1' });
}

function bad(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } { const e = new Error(message) as Error & { statusCode: number; code: string }; e.statusCode = statusCode; e.code = code; return e; }
