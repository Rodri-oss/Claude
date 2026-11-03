import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { cookieOptions, deleteSession, SESSION_COOKIE } from "@/lib/server/auth";

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  return res;
}
