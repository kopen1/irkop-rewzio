import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config/index.js';
import type { PrismaClient } from '@prisma/client';
import { ok } from '../middleware/response.js';
import { authenticateUser, type AccessClaims } from '../middleware/authentication.js';
import { UserService, type DeviceInput, type ProfilePatch } from '../modules/user/service.js';

interface RequestWithClaims extends FastifyRequest { userClaims?: AccessClaims; }
interface AppBody { appId?: string }
interface ProfileBody extends AppBody, ProfilePatch {}
interface DeviceBody extends AppBody, DeviceInput {}
interface DeleteAccountBody extends AppBody { refreshToken?: string; confirmation?: string }

export function registerUserRoutes(app: FastifyInstance, config: AppConfig, db: PrismaClient): void {
  const audit = { log: (event: string, details: Record<string, unknown>) => app.log.info({ event, ...details }, 'user audit') };
  const users = new UserService(db, config.jwtAccessSecret, audit);
  const authenticate = async (request: RequestWithClaims): Promise<AccessClaims> => {
    const claims = await authenticateUser(request, db, config.jwtAccessSecret);
    request.userClaims = claims;
    return claims;
  };
  const context = (claims: AccessClaims) => ({ userId: claims.sub, appId: claims.appId, sessionId: claims.sid });
  const appMatches = (bodyAppId: string | undefined, claims: AccessClaims): void => {
    if (bodyAppId !== undefined && bodyAppId !== claims.appId) throw bad(403, 'APP_NOT_AUTHORIZED', 'Token is not authorized for this app');
  };

  app.register(async (api) => {
    api.get('/me', async (request) => ok(await users.getMe(context(await authenticate(request as RequestWithClaims)))));
    api.patch<{ Body: ProfileBody }>('/me', async (request) => {
      const claims = await authenticate(request as RequestWithClaims);
      appMatches(request.body.appId, claims);
      const { appId: _appId, ...patch } = request.body;
      return ok(await users.updateMe(context(claims), patch));
    });
    api.get('/devices', async (request) => ok(await users.listDevices(context(await authenticate(request as RequestWithClaims)))));
    api.post<{ Body: DeviceBody }>('/devices', async (request) => {
      const claims = await authenticate(request as RequestWithClaims);
      appMatches(request.body.appId, claims);
      if (!request.body.installationId || !request.body.platform || !request.body.appVersion) throw bad(400, 'BAD_REQUEST', 'installationId, platform and appVersion are required');
      return ok(await users.registerDevice(context(claims), request.body));
    });
    api.delete<{ Params: { id: string } }>('/devices/:id', async (request) => {
      const claims = await authenticate(request as RequestWithClaims);
      await users.deleteDevice(context(claims), request.params.id);
      return ok({ deleted: true });
    });
    api.get('/sessions', async (request) => ok(await users.listSessions(context(await authenticate(request as RequestWithClaims)))));
    api.delete<{ Params: { id: string } }>('/sessions/:id', async (request) => {
      const claims = await authenticate(request as RequestWithClaims);
      await users.deleteSession(context(claims), request.params.id);
      return ok({ revoked: true });
    });
    api.delete<{ Body: DeleteAccountBody }>('/account', async (request) => {
      const claims = await authenticate(request as RequestWithClaims);
      appMatches(request.body?.appId, claims);
      if (!request.body?.refreshToken || !request.body.confirmation) throw bad(400, 'BAD_REQUEST', 'refreshToken and confirmation are required');
      return ok(await users.requestAccountDeletion(context(claims), request.body.refreshToken, request.body.confirmation));
    });
  }, { prefix: '/api/v1/user' });
}

function bad(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } { const error = new Error(message) as Error & { statusCode: number; code: string }; error.statusCode = statusCode; error.code = code; return error; }
