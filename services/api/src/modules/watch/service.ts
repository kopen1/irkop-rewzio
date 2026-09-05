import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../../core/redis.js';
import { RewardEngine } from '../rewards/engine.js';

const MAX_HEARTBEAT_GAP_SECONDS = 45;
const POSITION_TOLERANCE_SECONDS = 5;
const RAPID_COMPLETION_SECONDS = 15;
const VELOCITY_WINDOW_SECONDS = 60;
const MAX_EVENTS_PER_WINDOW = 30;

export class WatchService {
  private readonly rewards: RewardEngine;
  constructor(private readonly db: PrismaClient, private readonly redis: RedisConnection) { this.rewards = new RewardEngine(db, redis); }

  async list(appId: string): Promise<unknown[]> {
    const now = new Date();
    const items = await this.db.watchContents.findMany({ where: { appId, status: 'ACTIVE', AND: [{ OR: [{ startAt: null }, { startAt: { lte: now } }] }, { OR: [{ endAt: null }, { endAt: { gte: now } }] }] }, orderBy: { createdAt: 'desc' } });
    return items.map((item: (typeof items)[number]) => ({ id: item.id, title: item.title, description: item.description, sourceUrl: item.sourceUrl, durationSeconds: item.durationSeconds, minimumWatchSeconds: item.minimumWatchSeconds, rewardAmount: item.rewardAmount.toString(), status: item.status }));
  }

  async start(appId: string, userId: string, authSessionId: string, contentId: string, deviceId: string | null, idempotencyKey: string): Promise<unknown> {
    validateKey(idempotencyKey);
    const content = await this.getActiveContent(appId, contentId);
    validateLegalSourceUrl(content.sourceUrl);
    const authSession = await this.validateAuthSession(appId, userId, authSessionId);
    const device = await this.validateDevice(appId, userId, authSession.deviceId, deviceId);
    const existing = await this.db.watchSessions.findUnique({ where: { idempotencyKey } });
    if (existing) {
      if (existing.appId !== appId || existing.userId !== userId || existing.watchContentId !== contentId || existing.deviceId !== device.id) throw error(409, 'IDEMPOTENCY_CONFLICT', 'Watch session idempotency key conflict');
      return this.sessionResult(existing);
    }
    const velocity = await this.db.watchSessions.count({ where: { appId, userId, startedAt: { gte: new Date(Date.now() - VELOCITY_WINDOW_SECONDS * 1000) } } });
    if (velocity >= MAX_EVENTS_PER_WINDOW) throw error(429, 'WATCH_VELOCITY_REJECTED', 'Watch activity is too fast');
    const session = await this.db.watchSessions.create({ data: { appId, userId, watchContentId: content.id, deviceId: device.id, startedAt: new Date(), watchedSeconds: 0, status: 'STARTED', idempotencyKey } });
    return this.sessionResult(session);
  }

  async heartbeat(appId: string, userId: string, authSessionId: string, watchSessionId: string, positionSeconds: number, metadata?: unknown): Promise<unknown> {
    if (!watchSessionId) throw error(400, 'WATCH_SESSION_REQUIRED', 'watchSessionId is required');
    if (!Number.isInteger(positionSeconds) || positionSeconds < 0) throw error(400, 'INVALID_POSITION', 'positionSeconds must be a non-negative integer');
    const authSession = await this.validateAuthSession(appId, userId, authSessionId);
    const session = await this.db.watchSessions.findUnique({ where: { id: watchSessionId }, include: { watchContent: true } });
    if (!session || session.appId !== appId || session.userId !== userId) throw error(404, 'WATCH_SESSION_NOT_FOUND', 'Watch session not found');
    if (session.deviceId !== authSession.deviceId) throw error(403, 'DEVICE_INVALID', 'Device does not match watch session');
    if (session.status === 'COMPLETED') throw error(409, 'WATCH_ALREADY_COMPLETED', 'Watch session is already completed');
    if (session.status === 'REJECTED' || session.status === 'EXPIRED') throw error(409, 'WATCH_SESSION_CLOSED', 'Watch session is closed');
    if (positionSeconds > session.watchContent.durationSeconds) throw error(400, 'POSITION_OUT_OF_RANGE', 'Watch position exceeds content duration');
    await this.validateDevice(appId, userId, authSession.deviceId, authSession.deviceId);
    const now = new Date();
    const previous = await this.db.watchEvents.findFirst({ where: { appId, watchSessionId: session.id }, orderBy: { occurredAt: 'desc' } });
    if (previous) {
      const elapsed = Math.max(0, Math.floor((now.getTime() - previous.occurredAt.getTime()) / 1000));
      const positionDelta = positionSeconds - previous.positionSeconds;
      if (positionDelta < 0) throw error(400, 'POSITION_REGRESSION', 'Watch position cannot move backwards');
      if (positionDelta > elapsed + POSITION_TOLERANCE_SECONDS) throw error(400, 'HEARTBEAT_INVALID', 'Heartbeat progress is faster than real time');
    }
    const velocity = await this.db.watchEvents.count({ where: { appId, watchSessionId: session.id, occurredAt: { gte: new Date(now.getTime() - VELOCITY_WINDOW_SECONDS * 1000) } } });
    if (velocity >= MAX_EVENTS_PER_WINDOW) throw error(429, 'WATCH_VELOCITY_REJECTED', 'Too many heartbeat events');
    const watchedSeconds = calculateWatchedSeconds(session.startedAt, now, positionSeconds, session.watchedSeconds);
    await this.db.watchEvents.create({ data: { appId, watchSessionId: session.id, eventType: 'HEARTBEAT', positionSeconds, metadata: metadata === undefined ? undefined : metadata as object, occurredAt: now } });
    const updated = await this.db.watchSessions.update({ where: { id: session.id }, data: { lastHeartbeatAt: now, watchedSeconds, status: 'IN_PROGRESS' } });
    return { sessionId: updated.id, status: updated.status, positionSeconds, watchedSeconds, minimumWatchSeconds: session.watchContent.minimumWatchSeconds };
  }

  async complete(appId: string, userId: string, authSessionId: string, watchSessionId: string, idempotencyKey: string): Promise<unknown> {
    validateKey(idempotencyKey);
    const authSession = await this.validateAuthSession(appId, userId, authSessionId);
    const session = await this.db.watchSessions.findUnique({ where: { id: watchSessionId }, include: { watchContent: true } });
    if (!session || session.appId !== appId || session.userId !== userId) throw error(404, 'WATCH_SESSION_NOT_FOUND', 'Watch session not found');
    if (session.deviceId !== authSession.deviceId) throw error(403, 'DEVICE_INVALID', 'Device does not match watch session');
    await this.validateDevice(appId, userId, authSession.deviceId, authSession.deviceId);
    if (session.status === 'COMPLETED') {
      const redemption = await this.db.rewardRedemptions.findUnique({ where: { idempotencyKey: `watch:${session.id}` } });
      return { sessionId: session.id, status: 'COMPLETED', replayed: true, reward: redemption ? { redemptionId: redemption.id, amount: redemption.amount.toString(), status: redemption.status } : null };
    }
    if (session.status !== 'IN_PROGRESS' && session.status !== 'STARTED') throw error(409, 'WATCH_SESSION_CLOSED', 'Watch session is closed');
    if (session.watchedSeconds < session.watchContent.minimumWatchSeconds) throw error(403, 'MINIMUM_WATCH_NOT_MET', 'Minimum watch requirement has not been met');
    if (!session.lastHeartbeatAt || Date.now() - session.lastHeartbeatAt.getTime() > MAX_HEARTBEAT_GAP_SECONDS * 1000) throw error(403, 'HEARTBEAT_REQUIRED', 'A recent heartbeat is required before completion');
    if (Date.now() - session.startedAt.getTime() < RAPID_COMPLETION_SECONDS * 1000) throw error(403, 'RAPID_COMPLETION_REJECTED', 'Watch completed too quickly');
    const recentEvents = await this.db.watchEvents.count({ where: { appId, watchSessionId: session.id, occurredAt: { gte: new Date(Date.now() - VELOCITY_WINDOW_SECONDS * 1000) } } });
    if (recentEvents > MAX_EVENTS_PER_WINDOW) throw error(429, 'WATCH_VELOCITY_REJECTED', 'Watch activity is too fast');

    const reward = await this.rewards.grant({ userId, appId, sessionId: authSession.id, sourceType: 'watch', sourceId: session.watchContentId, idempotencyKey: `watch:${session.id}`, metadata: { watchSessionId: session.id, completionIdempotencyKey: idempotencyKey } });
    const completed = await this.db.watchSessions.update({ where: { id: session.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
    return { sessionId: completed.id, status: completed.status, watchedSeconds: completed.watchedSeconds, reward };
  }

  private async getActiveContent(appId: string, contentId: string) {
    const now = new Date();
    const content = await this.db.watchContents.findFirst({ where: { id: contentId, appId, status: 'ACTIVE', AND: [{ OR: [{ startAt: null }, { startAt: { lte: now } }] }, { OR: [{ endAt: null }, { endAt: { gte: now } }] }] } });
    if (!content) throw error(404, 'WATCH_CONTENT_NOT_FOUND', 'Watch content is not available');
    if (content.durationSeconds <= 0 || content.minimumWatchSeconds <= 0 || content.minimumWatchSeconds > content.durationSeconds) throw error(409, 'WATCH_CONTENT_INVALID', 'Watch content configuration is invalid');
    return content;
  }

  private async validateAuthSession(appId: string, userId: string, sessionId: string) {
    const session = await this.db.userSessions.findUnique({ where: { id: sessionId } });
    if (!session || session.appId !== appId || session.userId !== userId || session.status !== 'ACTIVE' || session.expiresAt.getTime() <= Date.now()) throw error(401, 'SESSION_INVALID', 'Session is invalid');
    if (!session.deviceId) throw error(403, 'DEVICE_REQUIRED', 'An active device is required for watch');
    return session;
  }

  private async validateDevice(appId: string, userId: string, sessionDeviceId: string | null, expectedDeviceId: string | null) {
    if (!sessionDeviceId || (expectedDeviceId && expectedDeviceId !== sessionDeviceId)) throw error(403, 'DEVICE_INVALID', 'Device does not match session');
    const device = await this.db.userDevices.findUnique({ where: { id: sessionDeviceId } });
    if (!device || device.appId !== appId || device.userId !== userId || device.status !== 'ACTIVE') throw error(403, 'DEVICE_INVALID', 'Device is not eligible for watch rewards');
    if (device.integrityStatus === 'FAILED' || device.integrityStatus === 'UNSUPPORTED') throw error(403, 'INTEGRITY_FAILED', 'Device integrity check failed');
    return device;
  }

  private sessionResult(session: { id: string; watchContentId: string; startedAt: Date; status: string; watchedSeconds: number }) { return { sessionId: session.id, watchContentId: session.watchContentId, startedAt: session.startedAt, status: session.status, watchedSeconds: session.watchedSeconds }; }
}

function calculateWatchedSeconds(startedAt: Date, now: Date, positionSeconds: number, previousWatched: number): number { return Math.max(previousWatched, Math.min(positionSeconds, Math.floor((now.getTime() - startedAt.getTime()) / 1000))); }
function validateKey(key: string): void { if (!key || key.length < 8 || key.length > 255) throw error(400, 'INVALID_IDEMPOTENCY_KEY', 'Invalid idempotency key'); }
function validateLegalSourceUrl(sourceUrl: string): void { try { const url = new URL(sourceUrl); if (url.protocol !== 'https:') throw new Error(); } catch { throw error(409, 'CONTENT_SOURCE_NOT_AUTHORIZED', 'Watch content must use an authorized HTTPS source'); } }
function error(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } { const e = new Error(message) as Error & { statusCode: number; code: string }; e.statusCode = statusCode; e.code = code; return e; }
