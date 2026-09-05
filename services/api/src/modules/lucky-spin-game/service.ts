import { randomInt, randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../../core/redis.js';
import { RewardEngine } from '../rewards/engine.js';

export type OutcomeKind = 'lucky_reward' | 'spin' | 'game';
const LIMITS: Record<OutcomeKind, number> = { lucky_reward: 10, spin: 10, game: 20 };

export class LuckySpinGameService {
  private readonly rewards: RewardEngine;
  constructor(private readonly db: PrismaClient, private readonly redis: RedisConnection) { this.rewards = new RewardEngine(db, redis); }

  async play(appId: string, userId: string, sessionId: string, kind: OutcomeKind, idempotencyKey: string) {
    validateKey(idempotencyKey);
    const replay = await this.redis.get(`outcome:${kind}:idempotency:${appId}:${userId}:${idempotencyKey}`);
    if (replay) return { ...JSON.parse(replay), replayed: true };
    const count = await this.redis.incrementWithExpiry(`outcome:${kind}:daily:${appId}:${userId}:${day()}`, 86400);
    if (count > LIMITS[kind]) throw err('DAILY_LIMIT', `${kind} daily limit reached`, 429);

    let outcome: { id: string; name: string; amount: bigint; weight?: number };
    if (kind === 'lucky_reward') outcome = await weightedLucky(this.db, appId);
    else if (kind === 'spin') outcome = await weightedSpin(this.db, appId);
    else outcome = await weightedGame(this.db, appId);

    const result = await this.rewards.grant({ appId, userId, sessionId, sourceType: kind, sourceId: outcome.id, idempotencyKey: `${kind}:${idempotencyKey}`, metadata: { outcomeId: outcome.id, serverSelected: true, outcomeToken: randomUUID() } });
    const response = { status: 'CONFIRMED', kind, outcomeId: outcome.id, name: outcome.name, amount: result.amount.toString(), rewardId: result.rewardId };
    await this.redis.set(`outcome:${kind}:idempotency:${appId}:${userId}:${idempotencyKey}`, JSON.stringify(response), 86400);
    return { ...response, replayed: result.replayed };
  }

  async quiz(appId: string, userId: string, sessionId: string, quizId: string, answers: string[], idempotencyKey: string) {
    validateKey(idempotencyKey);
    const replay = await this.redis.get(`quiz:idempotency:${appId}:${userId}:${idempotencyKey}`);
    if (replay) return { ...JSON.parse(replay), replayed: true };
    const count = await this.redis.incrementWithExpiry(`quiz:daily:${appId}:${userId}:${day()}`, 86400);
    if (count > 20) throw err('DAILY_LIMIT', 'Quiz daily limit reached', 429);
    const quiz = await this.db.quizzes.findFirst({ where: { id: quizId, appId, status: 'ACTIVE' } });
    if (!quiz) throw err('QUIZ_NOT_FOUND', 'Quiz is not active', 404);
    const questions = await this.db.quizQuestions.findMany({ where: { appId, quizId }, orderBy: { sortOrder: 'asc' } });
    if (!questions.length || answers.length !== questions.length) throw err('QUIZ_INVALID', 'All quiz answers are required', 400);
    let correct = 0;
    for (let i = 0; i < questions.length; i++) {
      const answer = await this.db.quizAnswers.findFirst({ where: { appId, questionId: questions[i].id, id: answers[i] } });
      if (answer?.isCorrect) correct++;
    }
    if (correct !== questions.length) throw err('QUIZ_FAILED', 'Quiz answers are incorrect', 409);
    const reward = await this.db.rewards.findFirst({ where: { appId, sourceType: 'quiz', sourceId: quizId, status: 'CONFIRMED' }, orderBy: { createdAt: 'desc' } });
    if (!reward || reward.amount !== quiz.rewardAmount || reward.amount <= 0n) throw err('REWARD_CONFIGURATION_INVALID', 'Quiz reward configuration is invalid', 500);
    const result = await this.rewards.grant({ appId, userId, sessionId, sourceType: 'quiz', sourceId: quizId, idempotencyKey: `quiz:${idempotencyKey}`, metadata: { quizId, score: correct, total: questions.length, serverValidated: true } });
    const response = { status: 'CONFIRMED', quizId, score: correct, total: questions.length, amount: result.amount.toString(), rewardId: result.rewardId };
    await this.redis.set(`quiz:idempotency:${appId}:${userId}:${idempotencyKey}`, JSON.stringify(response), 86400);
    return { ...response, replayed: result.replayed };
  }
}

async function weightedLucky(db: PrismaClient, appId: string) { const items = await db.luckyRewards.findMany({ where: { appId, status: 'ACTIVE', weight: { gt: 0 } } }); return choose(items); }
async function weightedSpin(db: PrismaClient, appId: string) { const items = await db.spinRewards.findMany({ where: { appId, status: 'ACTIVE', weight: { gt: 0 } } }); return choose(items); }
async function weightedGame(db: PrismaClient, appId: string) { const items = await db.rewards.findMany({ where: { appId, sourceType: 'game', status: 'CONFIRMED', amount: { gt: 0n } }, orderBy: { createdAt: 'desc' }, take: 100 }); if (!items.length) throw err('REWARD_NOT_AVAILABLE', 'Game reward is not available', 404); return choose(items.map((r) => ({ id: r.id, name: r.name, rewardAmount: r.amount, weight: Number((r.metadata as Record<string, unknown> | null)?.weight ?? 1) }))); }
function choose<T extends { id: string; name: string; rewardAmount: bigint; weight: number }>(items: T[]) { if (!items.length) throw err('REWARD_NOT_AVAILABLE', 'No active outcome is configured', 404); const total = items.reduce((n, i) => n + Math.max(0, i.weight), 0); if (!Number.isSafeInteger(total) || total <= 0) throw err('REWARD_CONFIGURATION_INVALID', 'Outcome weights are invalid', 500); let pick = randomInt(total); for (const item of items) { pick -= Math.max(0, item.weight); if (pick < 0) return { id: item.id, name: item.name, amount: item.rewardAmount, weight: item.weight }; } throw err('OUTCOME_FAILED', 'Unable to select outcome', 500); }
function day() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function validateKey(key: string) { if (!key || key.length < 8 || key.length > 255) throw err('INVALID_IDEMPOTENCY_KEY', 'Invalid idempotency key', 400); }
function err(code: string, message: string, statusCode: number): Error & { code: string; statusCode: number } { return Object.assign(new Error(message), { code, statusCode }); }
