import type { Env } from '../worker.js';

const ACCESS_TTL = 900;
const REFRESH_TTL = 2_592_000;
const OTP_TTL = 300;
const OTP_MAX_ATTEMPTS = 5;

export interface AuthConfig {
  jwtAccessSecret: string;
  otpSecret: string;
  googleClientId: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; phone: string | null; status: string };
}

const enc = new TextEncoder();

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return base64url(new Uint8Array(bytes));
}

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', enc.encode(value));
  return hex(new Uint8Array(bytes));
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function jsonb(value: unknown): string { return base64url(enc.encode(JSON.stringify(value))); }
function randomHex(bytes: number): string { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return hex(a); }
function hex(a: Uint8Array): string { return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); }
function now(): string { return new Date().toISOString(); }
function normalizePhone(phone: string): string {
  const v = phone.replace(/[\s()-]/g, '');
  if (!/^\+?[1-9]\d{7,14}$/.test(v)) throw error('INVALID_PHONE', 'Invalid phone number', 400);
  return v.startsWith('+') ? v : `+${v}`;
}
function error(code: string, message: string, status = 401): Error & { statusCode: number; code: string } {
  const e = new Error(message) as Error & { statusCode: number; code: string }; e.statusCode = status; e.code = code; return e;
}

export async function requestOtp(env: Env, config: AuthConfig, appId: string, phone: string, ip?: string): Promise<void> {
  const normalized = normalizePhone(phone);
  const code = String(100000 + crypto.getRandomValues(new Uint32Array(1))[0] % 900000);
  const codeHash = await hmac(config.otpSecret, code);
  const id = randomHex(16);
  await env.DB.prepare(`INSERT INTO otp_requests (id,app_id,phone,purpose,code_hash,status,attempts,expires_at,ip_address,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, appId, normalized, 'LOGIN', codeHash, 'PENDING', 0, new Date(Date.now() + OTP_TTL * 1000).toISOString(), ip ?? null, now(), now()).run();
  // Delivery is intentionally delegated to the configured edge/provider integration.
  // Never log the OTP or persist it in plaintext.
}

export async function verifyOtp(env: Env, config: AuthConfig, appId: string, phone: string, code: string, ip?: string): Promise<AuthResult> {
  const normalized = normalizePhone(phone);
  const row = await env.DB.prepare(`SELECT * FROM otp_requests WHERE app_id=? AND phone=? AND purpose='LOGIN' AND status='PENDING' ORDER BY created_at DESC LIMIT 1`).bind(appId, normalized).first<Record<string, unknown>>();
  if (!row) throw error('INVALID_OTP', 'Invalid or expired OTP');
  const id = String(row.id);
  const expires = Date.parse(String(row.expires_at));
  const attempts = Number(row.attempts ?? 0);
  if (expires <= Date.now()) { await env.DB.prepare(`UPDATE otp_requests SET status='EXPIRED',updated_at=? WHERE id=?`).bind(now(), id).run(); throw error('OTP_EXPIRED', 'Invalid or expired OTP'); }
  if (attempts >= OTP_MAX_ATTEMPTS) { throw error('OTP_LOCKED', 'Too many verification attempts'); }
  const expected = await hmac(config.otpSecret, code);
  if (expected !== String(row.code_hash)) {
    const next = attempts + 1;
    await env.DB.prepare(`UPDATE otp_requests SET attempts=?,status=?,updated_at=? WHERE id=?`).bind(next, next >= OTP_MAX_ATTEMPTS ? 'LOCKED' : 'PENDING', now(), id).run();
    throw error(next >= OTP_MAX_ATTEMPTS ? 'OTP_LOCKED' : 'INVALID_OTP', next >= OTP_MAX_ATTEMPTS ? 'Too many verification attempts' : 'Invalid or expired OTP');
  }
  let user = await env.DB.prepare(`SELECT id,phone,status FROM users WHERE phone=? LIMIT 1`).bind(normalized).first<{id:string;phone:string|null;status:string}>();
  if (!user) {
    const userId = randomHex(16);
    await env.DB.prepare(`INSERT INTO users (id,phone,phone_verified_at,status,referral_code,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`).bind(userId, normalized, now(), 'ACTIVE', randomHex(8), now(), now()).run();
    user = { id: userId, phone: normalized, status: 'ACTIVE' };
  }
  if (user.status !== 'ACTIVE') throw error('ACCOUNT_SUSPENDED', 'Account is suspended', 403);
  await env.DB.prepare(`UPDATE otp_requests SET status='VERIFIED',consumed_at=?,updated_at=? WHERE id=?`).bind(now(), now(), id).run();
  await env.DB.prepare(`INSERT INTO user_apps (id,app_id,user_id,status,first_seen_at,last_seen_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(app_id,user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,updated_at=excluded.updated_at`).bind(randomHex(16), appId, user.id, 'ACTIVE', now(), now(), now(), now()).run();
  await env.DB.prepare(`UPDATE users SET phone_verified_at=?,last_login_at=?,updated_at=? WHERE id=?`).bind(now(), now(), now(), user.id).run();
  return issueSession(env, config, appId, user.id, user.phone, ip);
}

export async function refresh(env: Env, config: AuthConfig, appId: string, raw: string): Promise<AuthResult> {
  const hash = await sha256(raw);
  const token = await env.DB.prepare(`SELECT * FROM refresh_tokens WHERE token_hash=? LIMIT 1`).bind(hash).first<Record<string, unknown>>();
  if (!token || token.revoked_at || Date.parse(String(token.expires_at)) <= Date.now() || String(token.app_id) !== appId) throw error('INVALID_REFRESH_TOKEN', 'Invalid refresh token');
  const user = await env.DB.prepare(`SELECT id,phone,status FROM users WHERE id=?`).bind(String(token.user_id)).first<{id:string;phone:string|null;status:string}>();
  if (!user || user.status !== 'ACTIVE') throw error('INVALID_REFRESH_TOKEN', 'Invalid refresh token');
  const nextRaw = randomHex(48);
  const nextHash = await sha256(nextRaw);
  const t = now();
  const result = await env.DB.batch([
    env.DB.prepare(`UPDATE refresh_tokens SET revoked_at=?,updated_at=? WHERE id=? AND revoked_at IS NULL`).bind(t,t,String(token.id)),
    env.DB.prepare(`INSERT INTO refresh_tokens (id,app_id,user_id,session_id,token_hash,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`).bind(randomHex(16),appId,user.id,String(token.session_id ?? '' ) || null,nextHash,new Date(Date.now()+REFRESH_TTL*1000).toISOString(),t,t),
  ]);
  if ((result[0]?.meta.changes ?? 0) !== 1) throw error('INVALID_REFRESH_TOKEN', 'Invalid refresh token');
  return { accessToken: await accessToken(config.jwtAccessSecret,user.id,appId,String(token.session_id ?? '')), refreshToken: nextRaw, expiresIn: ACCESS_TTL, user };
}

async function issueSession(env: Env, config: AuthConfig, appId: string, userId: string, phone: string|null, ip?: string): Promise<AuthResult> {
  const sessionId = randomHex(16), raw = randomHex(48), tokenHash = await sha256(raw), t = now(), expires = new Date(Date.now()+REFRESH_TTL*1000).toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO user_sessions (id,app_id,user_id,token_hash,status,expires_at,last_seen_at,ip_address,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(sessionId,appId,userId,tokenHash,'ACTIVE',expires,t,ip ?? null,t,t),
    env.DB.prepare(`INSERT INTO refresh_tokens (id,app_id,user_id,session_id,token_hash,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`).bind(randomHex(16),appId,userId,sessionId,tokenHash,expires,t,t),
  ]);
  return { accessToken: await accessToken(config.jwtAccessSecret,userId,appId,sessionId), refreshToken: raw, expiresIn: ACCESS_TTL, user: { id:userId, phone, status:'ACTIVE' } };
}

async function accessToken(secret: string, userId: string, appId: string, sessionId: string): Promise<string> {
  const iat = Math.floor(Date.now()/1000);
  const input = `${jsonb({alg:'HS256',typ:'JWT'})}.${jsonb({sub:userId,appId,sid:sessionId,iat,exp:iat+ACCESS_TTL})}`;
  return `${input}.${await hmac(secret,input)}`;
}

export async function googleLogin(env: Env, config: AuthConfig, appId: string, idToken: string, ip?: string): Promise<AuthResult> {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) throw error('INVALID_GOOGLE_TOKEN','Invalid Google credential');
  const data = await response.json() as {aud?:string;sub?:string;email_verified?:boolean|string};
  if (data.aud !== config.googleClientId || !data.sub || (data.email_verified !== true && data.email_verified !== 'true')) throw error('INVALID_GOOGLE_TOKEN','Invalid Google credential');
  let user = await env.DB.prepare(`SELECT id,phone,status FROM users WHERE google_subject=? LIMIT 1`).bind(data.sub).first<{id:string;phone:string|null;status:string}>();
  if (!user) { const id=randomHex(16); await env.DB.prepare(`INSERT INTO users (id,google_subject,status,referral_code,created_at,updated_at) VALUES (?,?,?,?,?,?)`).bind(id,data.sub,'ACTIVE',randomHex(8),now(),now()).run(); user={id,phone:null,status:'ACTIVE'}; }
  if (user.status !== 'ACTIVE') throw error('ACCOUNT_SUSPENDED','Account is suspended',403);
  const t=now(); await env.DB.prepare(`INSERT INTO user_apps (id,app_id,user_id,status,first_seen_at,last_seen_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(app_id,user_id) DO UPDATE SET last_seen_at=excluded.last_seen_at,updated_at=excluded.updated_at`).bind(randomHex(16),appId,user.id,'ACTIVE',t,t,t,t).run();
  return issueSession(env,config,appId,user.id,user.phone,ip);
}

export async function logout(env: Env, raw: string): Promise<void> {
  const hash=await sha256(raw); const token=await env.DB.prepare(`SELECT id,session_id FROM refresh_tokens WHERE token_hash=?`).bind(hash).first<{id:string;session_id:string|null}>();
  if (!token) return; const t=now(); const statements=[env.DB.prepare(`UPDATE refresh_tokens SET revoked_at=?,updated_at=? WHERE id=?`).bind(t,t,token.id)];
  if (token.session_id) statements.push(env.DB.prepare(`UPDATE user_sessions SET status='REVOKED',revoked_at=?,updated_at=? WHERE id=?`).bind(t,t,token.session_id)); await env.DB.batch(statements);
}
