import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../core/redis.js';
import type { AppConfig } from '../config/index.js';
import { ok } from '../middleware/response.js';
import { authenticateUser, type AccessClaims } from '../middleware/authentication.js';
import { AdsService } from '../modules/ads/service.js';
import { SurveyService } from '../modules/survey/service.js';
import { OfferwallService } from '../modules/offerwall/service.js';

interface Req extends FastifyRequest { userClaims?: AccessClaims }

export function registerProviderRewardRoutes(app: FastifyInstance, config: AppConfig, db: PrismaClient, redis: RedisConnection): void {
  const ads = new AdsService(db, redis); const survey = new SurveyService(db, redis); const offerwall = new OfferwallService(db, redis);
  const auth = async (request: Req) => { const claims = await authenticateUser(request, db, config.jwtAccessSecret); request.userClaims = claims; return claims; };
  app.register(async (api) => {
    api.get('/ads', async (request) => { const claims = await auth(request as Req); const rewards = await db.rewards.findMany({ where: { appId: claims.appId, sourceType: 'ads', status: 'CONFIRMED' }, orderBy: { createdAt: 'desc' } }); return ok(rewards.map((r) => ({ id: r.id, sourceId: r.sourceId, name: r.name, amount: r.amount.toString(), metadata: r.metadata })) ); });
    api.get('/survey', async (request) => { const claims = await auth(request as Req); const items = await db.surveys.findMany({ where: { appId: claims.appId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }); return ok(items.map((s) => ({ id: s.id, externalId: s.externalId, provider: s.provider, title: s.title, rewardAmount: s.rewardAmount.toString() }))); });
    api.get('/offerwall', async (request) => { const claims = await auth(request as Req); const items = await db.offerwalls.findMany({ where: { appId: claims.appId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }); return ok(items.map((o) => ({ id: o.id, externalId: o.externalId, provider: o.provider, name: o.name }))); });
    api.post<{ Body: Record<string, unknown> }>('/ads/callback', async (request) => ads.callback(normalizeHeaders(request.headers), JSON.stringify(request.body ?? {}), request.body));
    api.post<{ Body: Record<string, unknown> }>('/survey/callback', async (request) => survey.callback(normalizeHeaders(request.headers), JSON.stringify(request.body ?? {}), request.body));
    api.post<{ Body: Record<string, unknown> }>('/offerwall/callback', async (request) => offerwall.callback(normalizeHeaders(request.headers), JSON.stringify(request.body ?? {}), request.body));
  }, { prefix: '/api/v1' });
}

function normalizeHeaders(headers: Record<string, unknown>): Record<string, string | undefined> { const out: Record<string, string | undefined> = {}; for (const [key, value] of Object.entries(headers)) out[key.toLowerCase()] = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : undefined; return out; }
