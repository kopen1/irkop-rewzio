import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../core/redis.js';
import type { AppConfig } from '../config/index.js';
import { ok } from '../middleware/response.js';
import { authenticateUser, type AccessClaims } from '../middleware/authentication.js';
import { PayoutService } from '../modules/payout/service.js';
interface Req extends FastifyRequest { userClaims?: AccessClaims }
interface WebhookBody { eventId?: string; event_id?: string; id?: string; eventType?: string; event_type?: string; providerReference?: string; provider_reference?: string; reference?: string; referenceId?: string; status?: string; appId?: string; [key: string]: unknown }
export function registerPayoutRoutes(app: FastifyInstance, config: AppConfig, db: PrismaClient, redis: RedisConnection): void {
  const service = new PayoutService(db, redis);
  const auth = async (request: Req) => { const claims = await authenticateUser(request, db, config.jwtAccessSecret); request.userClaims = claims; return claims; };
  app.register(async (api) => {
    api.get<{ Params: { withdrawalId: string } }>('/payouts/:withdrawalId', async (request) => { const claims = await auth(request as Req); return ok(await service.getPayout(claims.appId, request.params.withdrawalId)); });
    api.post<{ Params: { withdrawalId: string } }>('/payouts/:withdrawalId/process', async (request) => { const claims = await auth(request as Req); return ok(await service.processWithdrawal(claims.appId, request.params.withdrawalId), 'Payout processing started'); });
    api.get('/payouts/reconciliation', async (request) => { const claims = await auth(request as Req); return ok(await service.reconcile(claims.appId)); });
    api.post<{ Params: { provider: string }; Body: WebhookBody }>('/webhooks/payout/:provider', async (request) => {
      const payload = request.body ?? {}; const rawPayload = JSON.stringify(payload);
      const signature = typeof request.headers['x-signature'] === 'string' ? request.headers['x-signature'] : typeof request.headers['x-webhook-signature'] === 'string' ? request.headers['x-webhook-signature'] : undefined;
      const appId = typeof payload.appId === 'string' ? payload.appId : typeof request.headers['x-app-id'] === 'string' ? request.headers['x-app-id'] : '';
      if (!appId) throw bad(400, 'WEBHOOK_APP_REQUIRED', 'x-app-id or payload.appId is required');
      const input: { appId: string; providerCode: string; rawPayload: string; payload: Record<string, unknown>; signature?: string } = { appId, providerCode: request.params.provider, rawPayload, payload };
      if (signature !== undefined) input.signature = signature;
      return ok(await service.handleWebhook(input), 'Webhook processed');
    });
  }, { prefix: '/api/v1' });
}
function bad(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } { const e = new Error(message) as Error & { statusCode: string } as unknown as Error & { statusCode: number; code: string }; e.statusCode = statusCode; e.code = code; return e; }
