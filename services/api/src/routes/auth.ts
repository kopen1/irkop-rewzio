import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AuthService } from '../modules/auth/service.js';
import { ok } from '../middleware/response.js';
import type { AppConfig } from '../config/index.js';
import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../core/redis.js';

interface Body { appId: string; phone?: string; code?: string; idToken?: string; refreshToken?: string; }

export function registerAuthRoutes(app: FastifyInstance, config: AppConfig, db: PrismaClient, redis: RedisConnection): void {
  const audit = { log: (event: string, details: Record<string, unknown>) => app.log.info({ event, ...details }, 'auth audit') };
  const auth = new AuthService(db, redis, { jwtAccessSecret: config.jwtAccessSecret, otpSecret: config.otpSecret, googleClientId: config.googleClientId }, audit);
  app.register(async (api) => {
    api.post<{ Body: Body }>('/request-otp', async (request) => {
      if (!request.body.appId || !request.body.phone) throw bad('appId and phone are required');
      await auth.requestOtp(request.body.appId, request.body.phone, request.ip);
      return ok({ requested: true });
    });
    api.post<{ Body: Body }>('/verify-otp', async (request) => {
      if (!request.body.appId || !request.body.phone || !request.body.code) throw bad('appId, phone and code are required');
      return ok(await auth.verifyOtp(request.body.appId, request.body.phone, request.body.code, request.ip));
    });
    api.post<{ Body: Body }>('/google', async (request) => {
      if (!request.body.appId || !request.body.idToken) throw bad('appId and idToken are required');
      return ok(await auth.googleLogin(request.body.appId, request.body.idToken, request.ip));
    });
    api.post<{ Body: Body }>('/refresh', async (request) => {
      if (!request.body.appId || !request.body.refreshToken) throw bad('appId and refreshToken are required');
      return ok(await auth.refresh(request.body.appId, request.body.refreshToken, request.ip));
    });
    api.post<{ Body: Body }>('/logout', async (request) => {
      if (!request.body.refreshToken) throw bad('refreshToken is required');
      await auth.logout(request.body.refreshToken);
      return ok({ loggedOut: true });
    });
  }, { prefix: '/api/v1/auth' });
}

function bad(message: string): Error & { statusCode: number; code: string } { const error = new Error(message) as Error & { statusCode: number; code: string }; error.statusCode = 400; error.code = 'BAD_REQUEST'; return error; }
