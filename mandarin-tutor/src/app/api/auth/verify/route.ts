import { NextResponse } from "next/server";
import { consumeLoginToken, cookieOptions, createSession, SESSION_COOKIE, SESSION_DAYS } from "@/lib/server/auth";
import { readJson } from "@/lib/server/api";
import { safeNext } from "@/lib/server/tokens";

/**
 * Step 2: exchange the emailed token for a session cookie. This is a POST
 * (triggered by a button on /login/verify) so that email link scanners that
 * pre-fetch URLs can't burn the one-time token.
 */
export async function POST(req: Request) {
  const body = await readJson(req).catch(() => ({}) as Record<string, unknown>);
  const token = typeof body.token === "string" ? body.token : "";
  const result = token ? await consumeLoginToken(token) : null;
  if (!result) return NextResponse.json({ error: "This sign-in link is invalid or has expired." }, { status: 400 });
  const session = await createSession(result.user.id);
  const res = NextResponse.json({ ok: true, next: safeNext(result.next) });
  res.cookies.set(SESSION_COOKIE, session, cookieOptions(SESSION_DAYS * 86400));
  return res;
}
