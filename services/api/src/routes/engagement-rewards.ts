import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../core/redis.js';
import type { AppConfig } from '../config/index.js';
import { authenticateUser, type AccessClaims } from '../middleware/authentication.js';
import { ok } from '../middleware/response.js';
import { ReferralService } from '../modules/referral/service.js';
import { LuckySpinGameService, type OutcomeKind } from '../modules/lucky-spin-game/service.js';
interface Req extends FastifyRequest { userClaims?: AccessClaims }
export function registerEngagementRewardRoutes(app: FastifyInstance, config: AppConfig, db: PrismaClient, redis: RedisConnection) {
  const referral = new ReferralService(db, redis); const games = new LuckySpinGameService(db, redis);
  const auth = async (request: Req) => { const claims = await authenticateUser(request, db, config.jwtAccessSecret); request.userClaims = claims; return claims; };
  app.register(async (api) => {
    api.post<{ Body: { code?: string } }>('/referral/apply', async (request) => { const c = await auth(request as Req); return ok(await referral.create(c.appId, c.sub, request.body?.code ?? '')); });
    api.post<{ Params: { id: string }; Body: { sessionId?: string } }>('/referral/:id/qualify', async (request) => { const c = await auth(request as Req); return ok(await referral.qualify(c.appId, request.params.id, request.body?.sessionId ?? c.sid)); });
    for (const kind of ['lucky_reward', 'spin', 'game'] as OutcomeKind[]) api.post<{ Body: { sessionId?: string; idempotencyKey?: string } }>(`/${kind.replace('_reward', '')}/play`, async (request) => { const c = await auth(request as Req); return ok(await games.play(c.appId, c.sub, request.body?.sessionId ?? c.sid, kind, request.body?.idempotencyKey ?? '')); });
    api.get('/quiz', async (request) => { const c = await auth(request as Req); const quizzes = await db.quizzes.findMany({ where: { appId: c.appId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }); return ok((quizzes as any[]).map((q: any) => ({ id: q.id, title: q.title, description: q.description }))); });
    api.get<{ Params: { id: string } }>('/quiz/:id', async (request) => { const c = await auth(request as Req); const quiz = await db.quizzes.findFirst({ where: { id: request.params.id, appId: c.appId, status: 'ACTIVE' } }); if (!quiz) throw Object.assign(new Error('Quiz is not active'), { code: 'QUIZ_NOT_FOUND', statusCode: 404 }); const questions = await db.quizQuestions.findMany({ where: { appId: c.appId, quizId: quiz.id }, orderBy: { sortOrder: 'asc' } }); const answers = await db.quizAnswers.findMany({ where: { appId: c.appId, questionId: { in: questions.map((q: any) => q.id) } }, orderBy: { sortOrder: 'asc' } }); return ok({ id: quiz.id, title: quiz.title, description: quiz.description, questions: (questions as any[]).map((q: any) => ({ id: q.id, question: q.question, answers: (answers as any[]).filter((a: any) => a.questionId === q.id).map((a: any) => ({ id: a.id, answer: a.answer })) })) }); });
    api.post<{ Params: { id: string }; Body: { sessionId?: string; answers?: string[]; idempotencyKey?: string } }>('/quiz/:id/complete', async (request) => { const c = await auth(request as Req); return ok(await games.quiz(c.appId, c.sub, request.body?.sessionId ?? c.sid, request.params.id, request.body?.answers ?? [], request.body?.idempotencyKey ?? '')); });
  }, { prefix: '/api/v1' });
}
