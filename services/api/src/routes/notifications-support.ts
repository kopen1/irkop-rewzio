import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../core/redis.js';
import type { AppConfig } from '../config/index.js';
import { ok } from '../middleware/response.js';
import { authenticateUser, type AccessClaims } from '../middleware/authentication.js';
import { NotificationService } from '../modules/notifications/service.js';
import { SupportService } from '../modules/support/service.js';

interface Req extends FastifyRequest { userClaims?: AccessClaims }
export function registerNotificationSupportRoutes(app: FastifyInstance, config: AppConfig, db: PrismaClient, redis: RedisConnection): void {
  const notifications = new NotificationService(db, redis);
  const support = new SupportService(db);
  const auth = async (request: Req) => { const claims = await authenticateUser(request, db, config.jwtAccessSecret); request.userClaims = claims; return claims; };
  app.register(async (api) => {
    api.get('/notifications', async (request) => { const c = await auth(request as Req); const q = request.query as { unread?: string }; return ok(await notifications.list(c.appId, c.sub, q.unread === 'true')); });
    api.post<{ Params: { id: string } }>('/notifications/:id/read', async (request) => { const c = await auth(request as Req); return ok(await notifications.markRead(c.appId, c.sub, request.params.id)); });
    api.get('/notifications/preferences', async (request) => { const c = await auth(request as Req); return ok(await notifications.preferences(c.appId, c.sub)); });
    api.put<{ Body: Partial<Record<'inApp'|'push'|'email', boolean>> }>('/notifications/preferences', async (request) => { const c = await auth(request as Req); return ok(await notifications.updatePreferences(c.appId, c.sub, request.body ?? {})); });
    api.get('/support/categories', async (request) => { const c = await auth(request as Req); return ok(await support.categories(c.appId)); });
    api.get('/support/tickets', async (request) => { const c = await auth(request as Req); return ok(await support.listTickets(c.appId, c.sub)); });
    api.post<{ Body: { categoryId: string; subject: string; body: string; priority?: 'LOW'|'NORMAL'|'HIGH'|'URGENT'; idempotencyKey: string } }>('/support/tickets', async (request) => { const c = await auth(request as Req); return ok(await support.createTicket({ appId: c.appId, userId: c.sub, ...request.body })); });
    api.get<{ Params: { id: string } }>('/support/tickets/:id', async (request) => { const c = await auth(request as Req); return ok(await support.getTicket(c.appId, c.sub, request.params.id)); });
    api.post<{ Params: { id: string }; Body: { body: string } }>('/support/tickets/:id/reply', async (request) => { const c = await auth(request as Req); return ok(await support.reply({ appId: c.appId, userId: c.sub, ticketId: request.params.id, body: request.body.body })); });
    api.post<{ Params: { id: string }; Body: { messageId?: string; fileName: string; mimeType: string; sizeBytes: number; fileUrl: string } }>('/support/tickets/:id/attachments', async (request) => { const c = await auth(request as Req); return ok(await support.addAttachment({ appId: c.appId, userId: c.sub, ticketId: request.params.id, ...request.body })); });
    api.post<{ Params: { id: string }; Body: { action: string; reason?: string; status?: 'OPEN'|'IN_PROGRESS'|'WAITING_USER'|'WAITING_PROVIDER'|'RESOLVED'|'CLOSED'; priority?: 'LOW'|'NORMAL'|'HIGH'|'URGENT'; adminUserId: string } }>('/support/admin/tickets/:id/action', async (request) => { const c = await auth(request as Req); if (request.body.adminUserId !== c.sub) throw error(403, 'ADMIN_IDENTITY_MISMATCH', 'Admin identity mismatch'); return ok(await support.adminAction({ appId: c.appId, ticketId: request.params.id, ...request.body })); });
  }, { prefix: '/api/v1' });
}
function error(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } { const e = new Error(message) as Error & { statusCode: number; code: string }; e.statusCode = statusCode; e.code = code; return e; }
