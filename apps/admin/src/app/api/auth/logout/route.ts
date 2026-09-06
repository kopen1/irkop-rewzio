import { NextResponse } from "next/server";
import { cookies } from "next/headers";
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("rewzio_admin_session");
  return response;
}
