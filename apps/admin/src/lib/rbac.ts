import { createHmac, timingSafeEqual } from "node:crypto";

export type AdminRole = "ADMIN" | "STAFF";

export const PERMISSIONS = [
  "users.view", "users.edit", "users.suspend", "withdrawals.view", "withdrawals.approve", "withdrawals.reject",
  "rewards.view", "rewards.edit", "fraud.view", "fraud.action", "settings.view", "settings.edit", "payout.view", "payout.action",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ADMIN_ONLY: Permission[] = ["withdrawals.approve", "withdrawals.reject", "rewards.edit", "fraud.action", "settings.edit", "payout.action"];
const STAFF_DEFAULT: Permission[] = ["users.view", "users.edit", "users.suspend", "withdrawals.view", "rewards.view", "fraud.view", "settings.view", "payout.view"];

export function permissionsFor(role: AdminRole): Permission[] {
  return role === "ADMIN" ? [...PERMISSIONS] : STAFF_DEFAULT;
}
export function can(role: AdminRole, permission: Permission): boolean {
  return permissionsFor(role).includes(permission) && !(role === "STAFF" && ADMIN_ONLY.includes(permission));
}

export type Session = { email: string; role: AdminRole; exp: number };
function secret(): string {
  const value = process.env.ADMIN_SESSION_SECRET?.trim();
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("ADMIN_SESSION_SECRET must be configured in production");
  return "development-only-change-me";
}
const sign = (value: string) => createHmac("sha256", secret()).update(value).digest("base64url");

export function encodeSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}
export function decodeSession(value?: string): Session | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as Session;
    if ((session.role !== "ADMIN" && session.role !== "STAFF") || !session.email || session.exp <= Date.now()) return null;
    return session;
  } catch { return null; }
}

export function authenticate(email: string, password: string): Session | null {
  const normalized = email.trim().toLowerCase();
  const accounts: Array<[string | undefined, string | undefined, AdminRole]> = [
    [process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, "ADMIN"],
    [process.env.STAFF_EMAIL, process.env.STAFF_PASSWORD, "STAFF"],
  ];
  const account = accounts.find(([e, p]) => e?.toLowerCase() === normalized && p === password);
  return account ? { email: normalized, role: account[2], exp: Date.now() + 8 * 60 * 60 * 1000 } : null;
}
