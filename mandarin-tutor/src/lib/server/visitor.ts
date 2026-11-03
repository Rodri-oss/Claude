import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

export const VISITOR_COOKIE = "mt_vid";

/** Anonymous visitor id (cookie) so pricing clicks can be counted per person. */
export async function visitorId(): Promise<{ id: string; isNew: boolean }> {
  const jar = await cookies();
  const existing = jar.get(VISITOR_COOKIE)?.value;
  if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return { id: existing, isNew: false };
  return { id: randomBytes(12).toString("base64url"), isNew: true };
}

export const visitorCookieOptions = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 365 * 86400 };
