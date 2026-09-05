import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { RedisConnection } from '../../core/redis.js';
import type { AuthResult } from './types.js';

const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_ATTEMPTS = 5;
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface AuthConfig {
  jwtAccessSecret: string;
  otpSecret: string;
  googleClientId: string;
}

export interface AuditLogger { log(event: string, details: Record<string, unknown>): void; }

export class AuthService {
  constructor(
    private readonly db: PrismaClient,
    private readonly redis: RedisConnection,
    private readonly config: AuthConfig,
    private readonly audit: AuditLogger = { log: () => undefined },
  ) {}

  async requestOtp(appId: string, phone: string, ipAddress?: string): Promise<void> {
    const normalized = normalizePhone(phone);
    await this.limit(`auth:otp:ip:${ipAddress || 'unknown'}`, 10, 60);
    await this.limit(`auth:otp:phone:${normalized}`, 3, 600);
    const now = new Date();
    await this.db.otpRequests.create({
      data: {
        appId,
        phone: normalized,
        purpose: 'LOGIN',
        codeHash: this.hashOtp(this.generateOtp()),
        status: 'PENDING',
        attempts: 0,
        expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
        ipAddress,
      },
    });
    this.audit.log('auth.otp.requested', { appId, phone: maskPhone(normalized), ipAddress });
  }

  async verifyOtp(appId: string, phone: string, code: string, ipAddress?: string): Promise<AuthResult> {
    const normalized = normalizePhone(phone);
    await this.limit(`auth:verify:ip:${ipAddress || 'unknown'}`, 30, 600);
    const request = await this.db.otpRequests.findFirst({
      where: { appId, phone: normalized, purpose: 'LOGIN', status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!request) throw authError('INVALID_OTP', 'Invalid or expired OTP');
    if (request.expiresAt.getTime() <= Date.now()) {
      await this.db.otpRequests.update({ where: { id: request.id }, data: { status: 'EXPIRED' } });
      throw authError('OTP_EXPIRED', 'Invalid or expired OTP');
    }
    if (request.attempts >= OTP_MAX_ATTEMPTS) {
      await this.db.otpRequests.update({ where: { id: request.id }, data: { status: 'LOCKED' } });
      throw authError('OTP_LOCKED', 'Too many verification attempts');
    }
    if (!safeEqual(this.hashOtp(code), request.codeHash)) {
      const attempts = request.attempts + 1;
      await this.db.otpRequests.update({ where: { id: request.id }, data: { attempts, status: attempts >= OTP_MAX_ATTEMPTS ? 'LOCKED' : 'PENDING' } });
      throw authError('INVALID_OTP', 'Invalid or expired OTP');
    }
    const user = await this.findOrCreatePhoneUser(appId, normalized);
    assertActive(user.status);
    await this.db.otpRequests.update({ where: { id: request.id }, data: { status: 'VERIFIED', consumedAt: new Date() } });
    this.audit.log('auth.otp.verified', { appId, userId: user.id, ipAddress });
    return this.issueSession(appId, user.id, ipAddress);
  }

  async googleLogin(appId: string, idToken: string, ipAddress?: string): Promise<AuthResult> {
    await this.limit(`auth:google:ip:${ipAddress || 'unknown'}`, 20, 600);
    const identity = await verifyGoogleToken(idToken, this.config.googleClientId);
    let user = await this.db.users.findUnique({ where: { googleSubject: identity.sub } });
    if (!user) {
      user = await this.db.users.create({ data: { googleSubject: identity.sub, status: 'ACTIVE', referralCode: randomBytes(5).toString('hex') } });
    }
    assertActive(user.status);
    await this.db.userApps.upsert({ where: { appId_userId: { appId, userId: user.id } }, create: { appId, userId: user.id, status: 'ACTIVE', firstSeenAt: new Date(), lastSeenAt: new Date() }, update: { lastSeenAt: new Date() } });
    await this.db.users.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    this.audit.log('auth.google.success', { appId, userId: user.id, ipAddress });
    return this.issueSession(appId, user.id, ipAddress);
  }

  async refresh(appId: string, refreshToken: string, ipAddress?: string): Promise<AuthResult> {
    const tokenHash = hashToken(refreshToken);
    const current = await this.db.refreshTokens.findUnique({ where: { tokenHash }, include: { } });
    if (!current || current.revokedAt || current.expiresAt.getTime() <= Date.now()) throw authError('INVALID_REFRESH_TOKEN', 'Invalid refresh token');
    const user = await this.db.users.findUnique({ where: { id: current.userId } });
    if (!user) throw authError('INVALID_REFRESH_TOKEN', 'Invalid refresh token');
    assertActive(user.status);
    const next = await this.db.$transaction(async (tx) => {
      const created = await tx.refreshTokens.create({ data: { appId, userId: user.id, sessionId: current.sessionId, tokenHash: hashToken(randomBytes(48).toString('base64url')), expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000) } });
      await tx.refreshTokens.update({ where: { id: current.id }, data: { revokedAt: new Date(), replacedById: created.id } });
      return created;
    });
    const rawRefresh = this.recoverRawRefreshToken(next.tokenHash);
    const accessToken = this.createAccessToken(user.id, appId, current.sessionId || next.id);
    this.audit.log('auth.refresh.rotated', { appId, userId: user.id, sessionId: current.sessionId, ipAddress });
    return { accessToken, refreshToken: rawRefresh, expiresIn: ACCESS_TTL_SECONDS, user: { id: user.id, phone: user.phone, status: user.status } };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    const token = await this.db.refreshTokens.findUnique({ where: { tokenHash } });
    if (!token) return;
    await this.db.$transaction([
      this.db.refreshTokens.update({ where: { id: token.id }, data: { revokedAt: new Date() } }),
      ...(token.sessionId ? [this.db.userSessions.update({ where: { id: token.sessionId }, data: { status: 'REVOKED', revokedAt: new Date() } })] : []),
    ]);
    this.audit.log('auth.logout', { userId: token.userId, sessionId: token.sessionId });
  }

  private async findOrCreatePhoneUser(appId: string, phone: string) {
    let user = await this.db.users.findUnique({ where: { phone } });
    if (!user) user = await this.db.users.create({ data: { phone, phoneVerifiedAt: new Date(), status: 'ACTIVE', referralCode: randomBytes(5).toString('hex') } });
    await this.db.userApps.upsert({ where: { appId_userId: { appId, userId: user.id } }, create: { appId, userId: user.id, status: 'ACTIVE', firstSeenAt: new Date(), lastSeenAt: new Date() }, update: { lastSeenAt: new Date() } });
    await this.db.users.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date(), lastLoginAt: new Date() } });
    return { ...user, phone };
  }

  private async issueSession(appId: string, userId: string, ipAddress?: string): Promise<AuthResult> {
    const sessionId = randomBytes(16).toString('hex');
    const rawRefresh = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
    await this.db.userSessions.create({ data: { id: sessionId, appId, userId, tokenHash: hashToken(rawRefresh), status: 'ACTIVE', expiresAt, lastSeenAt: new Date(), ipAddress } });
    await this.db.refreshTokens.create({ data: { appId, userId, sessionId, tokenHash: hashToken(rawRefresh), expiresAt } });
    const user = await this.db.users.findUniqueOrThrow({ where: { id: userId } });
    return { accessToken: this.createAccessToken(userId, appId, sessionId), refreshToken: rawRefresh, expiresIn: ACCESS_TTL_SECONDS, user: { id: user.id, phone: user.phone, status: user.status } };
  }

  private createAccessToken(userId: string, appId: string, sessionId: string): string {
    const header = b64({ alg: 'HS256', typ: 'JWT' });
    const payload = b64({ sub: userId, appId, sid: sessionId, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ACCESS_TTL_SECONDS });
    const input = `${header}.${payload}`;
    const signature = createHmac('sha256', this.config.jwtAccessSecret).update(input).digest('base64url');
    return `${input}.${signature}`;
  }

  private hashOtp(code: string): string { return createHmac('sha256', this.config.otpSecret).update(code).digest('hex'); }
  private generateOtp(): string { return String(Math.floor(100000 + Math.random() * 900000)); }
  private async limit(key: string, max: number, window: number): Promise<void> {
    const count = await this.redis.incrementWithExpiry(key, window);
    if (count > max) throw authError('RATE_LIMITED', 'Too many authentication attempts');
  }
  private recoverRawRefreshToken(_hash: string): string { throw authError('REFRESH_ROTATION_INTERNAL', 'Refresh token rotation failed'); }
}

function b64(value: unknown): string { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function hashToken(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function safeEqual(a: string, b: string): boolean { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
function normalizePhone(phone: string): string { const value = phone.replace(/[\s()-]/g, ''); if (!/^\+?[1-9]\d{7,14}$/.test(value)) throw authError('INVALID_PHONE', 'Invalid phone number'); return value.startsWith('+') ? value : `+${value}`; }
function maskPhone(phone: string): string { return phone.length > 4 ? `${phone.slice(0, 3)}***${phone.slice(-2)}` : '***'; }
function assertActive(status: string): void { if (status !== 'ACTIVE') throw authError('ACCOUNT_SUSPENDED', 'Account is suspended'); }
function authError(code: string, message: string): Error & { statusCode: number; code: string } { const error = new Error(message) as Error & { statusCode: number; code: string }; error.statusCode = 401; error.code = code; return error; }

async function verifyGoogleToken(idToken: string, clientId: string): Promise<{ sub: string }> {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) throw authError('INVALID_GOOGLE_TOKEN', 'Invalid Google credential');
  const data = await response.json() as { aud?: string; sub?: string; email_verified?: string | boolean };
  if (data.aud !== clientId || !data.sub || (data.email_verified !== true && data.email_verified !== 'true')) throw authError('INVALID_GOOGLE_TOKEN', 'Invalid Google credential');
  return { sub: data.sub };
}
