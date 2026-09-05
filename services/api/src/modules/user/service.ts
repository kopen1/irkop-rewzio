import { createHmac, createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

const PENDING_WITHDRAWAL_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'PROCESSING', 'PENDING_PROVIDER', 'PENDING_CAPACITY'] as const;
const PROFILE_FIELDS = ['displayName', 'avatarUrl', 'locale', 'timezone'] as const;

export interface DeviceFingerprintProvider {
  hash(appId: string, fingerprint: string): string;
}

export interface UserAuditLogger {
  log(event: string, details: Record<string, unknown>): void;
}

export interface UserContext {
  userId: string;
  appId: string;
  sessionId: string;
}

export interface DeviceInput {
  installationId: string;
  platform: string;
  appVersion: string;
  fingerprint?: string;
  integrityStatus?: 'VERIFIED' | 'UNVERIFIED' | 'UNSUPPORTED' | 'FAILED' | 'UNKNOWN';
}

export interface ProfilePatch {
  displayName?: string | null;
  avatarUrl?: string | null;
  locale?: string;
  timezone?: string;
}

export class UserService {
  constructor(
    private readonly db: PrismaClient,
    private readonly secret: string,
    private readonly audit: UserAuditLogger = { log: () => undefined },
    private readonly fingerprintProvider: DeviceFingerprintProvider = new HmacDeviceFingerprintProvider(secret),
  ) {}

  async getMe(context: UserContext) {
    const user = await this.getOwnedUser(context);
    const profile = await this.db.userProfiles.findUnique({ where: { userId: user.id } });
    const app = await this.db.userApps.findUnique({ where: { appId_userId: { appId: context.appId, userId: user.id } } });
    return { user: publicUser(user), profile, appStatus: app?.status ?? null, sessionId: context.sessionId };
  }

  async updateMe(context: UserContext, patch: ProfilePatch) {
    const user = await this.getOwnedUser(context);
    assertMutableStatus(user.status);
    const data: Record<string, string | null> = {};
    for (const field of PROFILE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(patch, field)) {
        const value = patch[field];
        if (value !== undefined) data[field] = value as string | null;
      }
    }
    if (data.displayName !== undefined && typeof data.displayName === 'string' && data.displayName.length > 100) throw userError(400, 'INVALID_PROFILE', 'displayName is too long');
    if (data.locale !== undefined && typeof data.locale === 'string' && data.locale.length > 20) throw userError(400, 'INVALID_PROFILE', 'locale is too long');
    if (data.timezone !== undefined && typeof data.timezone === 'string' && data.timezone.length > 100) throw userError(400, 'INVALID_PROFILE', 'timezone is too long');
    if (data.avatarUrl !== undefined && typeof data.avatarUrl === 'string' && data.avatarUrl.length > 500) throw userError(400, 'INVALID_PROFILE', 'avatarUrl is too long');
    const profile = await this.db.userProfiles.upsert({
      where: { userId: user.id },
      create: { appId: context.appId, userId: user.id, displayName: data.displayName ?? null, avatarUrl: data.avatarUrl ?? null, locale: data.locale ?? 'id-ID', timezone: data.timezone ?? 'UTC' },
      update: data,
    });
    this.audit.log('user.profile.updated', { appId: context.appId, userId: user.id, sessionId: context.sessionId });
    return profile;
  }

  async listDevices(context: UserContext) {
    await this.getOwnedUser(context);
    return this.db.userDevices.findMany({ where: { appId: context.appId, userId: context.userId }, orderBy: { lastSeenAt: 'desc' } });
  }

  async registerDevice(context: UserContext, input: DeviceInput) {
    const user = await this.getOwnedUser(context);
    assertMutableStatus(user.status);
    const installationId = normalizeRequired(input.installationId, 'installationId', 200);
    const platform = normalizeRequired(input.platform, 'platform', 50);
    const appVersion = normalizeRequired(input.appVersion, 'appVersion', 50);
    const fingerprint = input.fingerprint?.trim() || installationId;
    if (fingerprint.length > 2048) throw userError(400, 'INVALID_DEVICE', 'fingerprint is too long');
    const deviceHash = this.fingerprintProvider.hash(context.appId, fingerprint);
    const existingInstallation = await this.db.userDevices.findUnique({ where: { appId_installationId: { appId: context.appId, installationId } } });
    const existingHash = await this.db.userDevices.findUnique({ where: { appId_deviceHash: { appId: context.appId, deviceHash } } });
    const existing = existingInstallation ?? existingHash;
    if (existing && existing.userId !== user.id) throw userError(403, 'DEVICE_NOT_AUTHORIZED', 'Device belongs to another account');
    const now = new Date();
    const data = { platform, appVersion, deviceHash, integrityStatus: input.integrityStatus ?? 'UNKNOWN' as const, lastSeenAt: now, status: 'ACTIVE' as const };
    const device = existing
      ? await this.db.userDevices.update({ where: { id: existing.id }, data })
      : await this.db.userDevices.create({ data: { appId: context.appId, userId: user.id, installationId, ...data, firstSeenAt: now, riskScore: 0 } });
    this.audit.log('user.device.registered', { appId: context.appId, userId: user.id, deviceId: device.id, sessionId: context.sessionId });
    return sanitizeDevice(device);
  }

  async deleteDevice(context: UserContext, deviceId: string): Promise<void> {
    await this.getOwnedUser(context);
    const device = await this.db.userDevices.findUnique({ where: { id: deviceId } });
    if (!device || device.appId !== context.appId || device.userId !== context.userId) throw userError(404, 'DEVICE_NOT_FOUND', 'Device not found');
    await this.db.userDevices.update({ where: { id: device.id }, data: { status: 'BLOCKED' } });
    await this.db.userSessions.updateMany({ where: { appId: context.appId, userId: context.userId, deviceId: device.id, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: new Date() } });
    this.audit.log('user.device.removed', { appId: context.appId, userId: context.userId, deviceId });
  }

  async listSessions(context: UserContext) {
    await this.getOwnedUser(context);
    const sessions = await this.db.userSessions.findMany({ where: { appId: context.appId, userId: context.userId }, orderBy: { lastSeenAt: 'desc' } });
    return sessions.map((session) => ({ id: session.id, deviceId: session.deviceId, ipAddress: session.ipAddress, userAgent: session.userAgent, status: session.status, expiresAt: session.expiresAt, revokedAt: session.revokedAt, lastSeenAt: session.lastSeenAt, createdAt: session.createdAt, current: session.id === context.sessionId }));
  }

  async deleteSession(context: UserContext, sessionId: string): Promise<void> {
    await this.getOwnedUser(context);
    const session = await this.db.userSessions.findUnique({ where: { id: sessionId } });
    if (!session || session.appId !== context.appId || session.userId !== context.userId) throw userError(404, 'SESSION_NOT_FOUND', 'Session not found');
    await this.db.$transaction([
      this.db.userSessions.update({ where: { id: session.id }, data: { status: 'REVOKED', revokedAt: new Date() } }),
      this.db.refreshTokens.updateMany({ where: { sessionId: session.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    this.audit.log('user.session.revoked', { appId: context.appId, userId: context.userId, sessionId });
  }

  async requestAccountDeletion(context: UserContext, refreshToken: string, confirmation: string): Promise<{ status: string; scheduled: boolean }> {
    const user = await this.getOwnedUser(context);
    if (user.status !== 'ACTIVE') throw userError(409, 'ACCOUNT_STATUS_INVALID', 'Account cannot be deleted in its current status');
    if (confirmation !== 'DELETE') throw userError(400, 'CONFIRMATION_REQUIRED', 'Account deletion requires confirmation');
    await this.reauthenticate(context, refreshToken);
    const pending = await this.db.withdrawals.findFirst({ where: { appId: context.appId, userId: context.userId, status: { in: [...PENDING_WITHDRAWAL_STATUSES] } }, select: { id: true } });
    if (pending) throw userError(409, 'WITHDRAWAL_PENDING', 'Account deletion is blocked while a withdrawal is pending');
    const now = new Date();
    const deletionDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await this.db.$transaction([
      this.db.users.update({ where: { id: user.id }, data: { status: 'DELETION_REQUESTED' } }),
      this.db.userApps.updateMany({ where: { appId: context.appId, userId: context.userId }, data: { status: 'SUSPENDED' } }),
      this.db.userSessions.updateMany({ where: { appId: context.appId, userId: context.userId, status: 'ACTIVE' }, data: { status: 'REVOKED', revokedAt: now } }),
      this.db.refreshTokens.updateMany({ where: { appId: context.appId, userId: context.userId, revokedAt: null }, data: { revokedAt: now } }),
      this.db.dataAnonymizationJobs.create({ data: { appId: context.appId, userId: context.userId, status: 'PENDING', scheduledAt: deletionDate } }),
      this.db.dataDeletionJobs.create({ data: { appId: context.appId, userId: context.userId, status: 'PENDING', scheduledAt: deletionDate } }),
    ]);
    this.audit.log('user.account.deletion_requested', { appId: context.appId, userId: context.userId, scheduledAt: deletionDate.toISOString() });
    return { status: 'DELETION_REQUESTED', scheduled: true };
  }

  private async getOwnedUser(context: UserContext) {
    const user = await this.db.users.findUnique({ where: { id: context.userId } });
    if (!user) throw userError(401, 'ACCOUNT_NOT_FOUND', 'Account not found');
    if (user.status === 'DELETED' || user.status === 'ANONYMIZED') throw userError(403, 'ACCOUNT_UNAVAILABLE', 'Account is no longer available');
    if (user.status === 'SUSPENDED') throw userError(403, 'ACCOUNT_SUSPENDED', 'Account is suspended');
    return user;
  }

  private async reauthenticate(context: UserContext, refreshToken: string): Promise<void> {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');
    const token = await this.db.refreshTokens.findUnique({ where: { tokenHash } });
    if (!token || token.userId !== context.userId || token.appId !== context.appId || token.sessionId !== context.sessionId || token.revokedAt || token.expiresAt.getTime() <= Date.now()) throw userError(401, 'REAUTH_REQUIRED', 'Re-authentication required');
  }
}

export class HmacDeviceFingerprintProvider implements DeviceFingerprintProvider {
  constructor(private readonly secret: string) {}
  hash(appId: string, fingerprint: string): string { return createHmac('sha256', this.secret).update(`${appId}:${fingerprint}`).digest('hex'); }
}

function publicUser(user: { id: string; phone: string | null; phoneVerifiedAt: Date | null; googleSubject: string | null; status: string; referralCode: string; lastLoginAt: Date | null; createdAt: Date; updatedAt: Date }) {
  return { id: user.id, phone: user.phone, phoneVerifiedAt: user.phoneVerifiedAt, hasGoogleIdentity: Boolean(user.googleSubject), status: user.status, referralCode: user.referralCode, lastLoginAt: user.lastLoginAt, createdAt: user.createdAt, updatedAt: user.updatedAt };
}
function sanitizeDevice(device: { id: string; installationId: string; platform: string; appVersion: string; integrityStatus: string; firstSeenAt: Date; lastSeenAt: Date; status: string; riskScore: number }) {
  return { id: device.id, installationId: device.installationId, platform: device.platform, appVersion: device.appVersion, integrityStatus: device.integrityStatus, firstSeenAt: device.firstSeenAt, lastSeenAt: device.lastSeenAt, status: device.status, riskScore: device.riskScore };
}
function assertMutableStatus(status: string): void { if (status !== 'ACTIVE') throw userError(403, 'ACCOUNT_NOT_ACTIVE', 'Account is not active'); }
function normalizeRequired(value: string, field: string, max: number): string { const normalized = value?.trim(); if (!normalized || normalized.length > max) throw userError(400, 'INVALID_DEVICE', `${field} is invalid`); return normalized; }
function userError(statusCode: number, code: string, message: string): Error & { statusCode: number; code: string } { const error = new Error(message) as Error & { statusCode: number; code: string }; error.statusCode = statusCode; error.code = code; return error; }
