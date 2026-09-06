import { NextResponse } from "next/server";
import { authenticate, encodeSession } from "@/lib/rbac";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { email?: string; password?: string } | null;
  if (!body?.email || !body.password) return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  const session = authenticate(body.email, body.password);
  if (!session) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  const response = NextResponse.json({ ok: true, role: session.role });
  response.cookies.set("rewzio_admin_session", encodeSession(session), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 8 * 60 * 60 });
  return response;
}
