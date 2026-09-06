import { cookies } from "next/headers";
import { decodeSession, type Session } from "./rbac";

export async function getAdminSession(): Promise<Session | null> {
  const store = await cookies();
  return decodeSession(store.get("rewzio_admin_session")?.value);
}
export async function requireAdmin(): Promise<Session> {
  const session = await getAdminSession();
  if (!session) throw new Error("UNAUTHENTICATED");
  return session;
}
