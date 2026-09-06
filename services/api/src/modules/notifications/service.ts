import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../../core/redis.js';

export type NotificationChannel = 'IN_APP' | 'PUSH';
export interface PushProvider { send(input: { userId: string; title: string; body: string; notificationId: string }): Promise<void>; }
export class MockPushProvider implements PushProvider { async send(_input: { userId: string; title: string; body: string; notificationId: string }): Promise<void> {} }

const DEFAULT_PREFS = { inApp: true, push: true, email: false };
const PREF_TTL = 60 * 60 * 24 * 365 * 5;

export class NotificationService {
  constructor(private readonly db: PrismaClient, private readonly redis: RedisConnection, private readonly push: PushProvider = new MockPushProvider()) {}

  async list(appId: string, userId: string, unreadOnly = false): Promise<unknown> {
    return this.db.notifications.findMany({ where: { appId, userId, ...(unreadOnly ? { readAt: null } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async markRead(appId: string, userId: string, id: string): Promise<unknown> {
    const notification = await this.db.notifications.findFirst({ where: { appId, userId, id } });
    if (!notification) throw error(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
    const result = await this.db.notifications.update({ where: { id }, data: { readAt: new Date(), status: 'READ' } });
    await this.audit(appId, userId, 'NOTIFICATION_READ', { notificationId: id });
    return result;
  }

  async preferences(appId: string, userId: string): Promise<Record<string, boolean>> {
    const raw = await this.redis.get(`notification:prefs:${appId}:${userId}`);
    if (!raw) return DEFAULT_PREFS;
    try { return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Record<string, boolean>) }; } catch { return DEFAULT_PREFS; }
  }

  async updatePreferences(appId: string, userId: string, input: Partial<Record<'inApp' | 'push' | 'email', boolean>>): Promise<Record<string, boolean>> {
    const prefs = { ...(await this.preferences(appId, userId)), ...input };
    await this.redis.set(`notification:prefs:${appId}:${userId}`, JSON.stringify(prefs), PREF_TTL);
    await this.audit(appId, userId, 'NOTIFICATION_PREFERENCES_UPDATED', { keys: Object.keys(input) });
    return prefs;
  }

  async create(input: { appId: string; userId: string; type: any; title: string; body: string; channel?: NotificationChannel; idempotencyKey: string }): Promise<unknown> {
    validateIdempotency(input.idempotencyKey);
    const key = `notification:${input.appId}:${input.userId}:${input.idempotencyKey}`;
    const existing = await this.redis.get(key);
    if (existing) return JSON.parse(existing);
    const prefs = await this.preferences(input.appId, input.userId);
    const channel = input.channel ?? (prefs.inApp ? 'IN_APP' : 'PUSH');
    if (channel === 'IN_APP' && !prefs.inApp) return { suppressed: true, reason: 'PREFERENCE_DISABLED' };
    if (channel === 'PUSH' && !prefs.push) return { suppressed: true, reason: 'PREFERENCE_DISABLED' };
    const notification = await this.db.notifications.create({ data: { appId: input.appId, userId: input.userId, type: input.type, title: input.title.slice(0, 160), body: input.body.slice(0, 4000), channel, status: 'PENDING' } });
    try {
      if (channel === 'PUSH') await this.push.send({ userId: input.userId, title: notification.title, body: notification.body, notificationId: notification.id });
      const sent = await this.db.notifications.update({ where: { id: notification.id }, data: { status: 'SENT' } });
      await this.redis.set(key, JSON.stringify(sent), 86400 * 30);
      await this.audit(input.appId, input.userId, 'NOTIFICATION_SENT', { notificationId: notification.id, channel });
      return sent;
    } catch (cause) {
      await this.db.notifications.update({ where: { id: notification.id }, data: { status: 'FAILED' } }).catch(() => undefined);
      await this.redis.set(`notification:retry:${notification.id}`, JSON.stringify({ notificationId: notification.id, attempts: 1 }), 86400);
      await this.audit(input.appId, input.userId, 'NOTIFICATION_FAILED', { notificationId: notification.id });
      throw cause;
    }
  }

  private async audit(appId: string, userId: string, eventType: string, metadata: Record<string, unknown>): Promise<void> {
    await this.db.systemLogs.create({ data: { appId, level: 'INFO', eventType, message: eventType, metadata: { userId, ...metadata } } }).catch(() => undefined);
  }
}
function validateIdempotency(key: string): void { if (typeof key !== 'string' || key.length < 8 || key.length > 255) throw error(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency key must be 8-255 characters'); }
function error(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } { const e = new Error(message) as Error & { statusCode: number; code: string }; e.statusCode = statusCode; e.code = code; return e; }
