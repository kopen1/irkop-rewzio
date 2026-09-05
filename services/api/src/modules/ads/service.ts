import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../../core/redis.js';
import { RewardEngine } from '../rewards/engine.js';
import { providerError, type AdsCallbackEvent, type AdsProvider } from './provider.js';

const SECRET = process.env.ADS_PROVIDER_SECRET?.trim() || '';
const RATE_WINDOW = 60;
const MAX_CALLBACKS = 60;

export class HmacAdsProvider implements AdsProvider {
  readonly name = 'generic';
  async verifyCallback(input: { headers: Record<string, string | undefined>; rawBody: string }): Promise<boolean> {
    const signature = input.headers['x-provider-signature'] || input.headers['x-signature'];
    if (!SECRET || !signature) return false;
    const expected = createHmac('sha256', SECRET).update(input.rawBody).digest('hex');
    const a = Buffer.from(signature, 'hex'); const b = Buffer.from(expected, 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }
  async normalizeCallback(input: unknown): Promise<AdsCallbackEvent> {
    const value = input as Record<string, unknown>;
    const eventId = stringValue(value.eventId ?? value.event_id);
    const userId = stringValue(value.userId ?? value.user_id);
    const appId = stringValue(value.appId ?? value.app_id);
    if (!eventId || !userId || !appId) throw providerError('INVALID_CALLBACK', 'Provider callback is missing required identifiers', 400);
    return { provider: this.name, eventId, userId, appId, placementId: stringValue(value.placementId ?? value.placement_id), rewardAmount: value.rewardAmount as AdsCallbackEvent['rewardAmount'], status: stringValue(value.status), occurredAt: stringValue(value.occurredAt ?? value.occurred_at), payload: value };
  }
}

export class AdsService {
  private readonly rewards: RewardEngine;
  constructor(private readonly db: PrismaClient, private readonly redis: RedisConnection, private readonly provider: AdsProvider = new HmacAdsProvider()) { this.rewards = new RewardEngine(db, redis); }

  async callback(headers: Record<string, string | undefined>, rawBody: string, body: unknown) {
    const verified = await this.provider.verifyCallback({ headers, rawBody });
    if (!verified) throw providerError('INVALID_PROVIDER_CALLBACK', 'Provider callback signature is invalid', 401);
    const event = await this.provider.normalizeCallback(body);
    const rate = await this.redis.incrementWithExpiry(`provider:ads:rate:${event.appId}`, RATE_WINDOW);
    if (rate > MAX_CALLBACKS) throw providerError('PROVIDER_RATE_LIMITED', 'Provider callback rate limit exceeded', 429);
    const rawHash = createHash('sha256').update(rawBody).digest('hex');
    await this.redis.set(`provider:ads:event:${event.eventId}`, JSON.stringify({ receivedAt: new Date().toISOString(), rawHash, payload: redact(event.payload) }), 7 * 24 * 60 * 60);
    const existing = await this.redis.get(`provider:ads:processed:${event.eventId}`);
    if (existing) return { status: 'DUPLICATE', eventId: event.eventId, replayed: true };
    if ((event.status || '').toUpperCase() !== 'COMPLETED') { await this.redis.set(`provider:ads:processed:${event.eventId}`, 'ignored', 24 * 60 * 60); return { status: 'IGNORED', eventId: event.eventId, replayed: false }; }
    if (!event.placementId) throw providerError('INVALID_REWARD_EVENT', 'placementId is required', 400);
    const result = await this.rewards.grant({ userId: event.userId, appId: event.appId, sessionId: stringValue(event.payload.sessionId) || 'provider', sourceType: 'ads', sourceId: event.placementId, idempotencyKey: `ads:${this.provider.name}:${event.eventId}`, metadata: { provider: this.provider.name, eventId: event.eventId, rawHash } });
    await this.redis.set(`provider:ads:processed:${event.eventId}`, result.rewardId, 7 * 24 * 60 * 60);
    return { status: 'CONFIRMED', eventId: event.eventId, replayed: result.replayed, reward: result };
  }
}
function stringValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function redact(value: unknown): unknown { if (Array.isArray(value)) return value.map(redact); if (!value || typeof value !== 'object') return value; const out: Record<string, unknown> = {}; for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[/token|secret|signature|authorization|password|api[_-]?key/i.test(key) ? '[REDACTED]' : key] = /token|secret|signature|authorization|password|api[_-]?key/i.test(key) ? '[REDACTED]' : redact(item); return out; }
