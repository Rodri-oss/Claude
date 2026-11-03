import "server-only";
import type { User } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { hashToken, newToken } from "./tokens";
import { adminEmail } from "./user";

export const SESSION_COOKIE = "mt_session";
export const SESSION_DAYS = 30;
export const LOGIN_TOKEN_MINUTES = 15;
export const MAX_LOGIN_REQUESTS_PER_HOUR = Number(process.env.LOGIN_RATE_LIMIT_PER_HOUR) || 5;

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && !process.env.INSECURE_COOKIES,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function createLoginToken(email: string, next: string | null) {
  const since = new Date(Date.now() - 3600_000);
  const recent = await prisma.loginToken.count({ where: { email, createdAt: { gte: since } } });
  if (recent >= MAX_LOGIN_REQUESTS_PER_HOUR) return null;
  const token = newToken();
  await prisma.loginToken.create({
    data: { email, next, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + LOGIN_TOKEN_MINUTES * 60_000) },
  });
  return token;
}

/** Consume a magic-link token. Returns the user and where to go next, or null. */
export async function consumeLoginToken(token: string) {
  const row = await prisma.loginToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;
  // mark used atomically: only succeeds if still unused
  const { count } = await prisma.loginToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (count !== 1) return null;
  const user = await prisma.user.upsert({ where: { email: row.email }, update: {}, create: { email: row.email } });
  return { user, next: row.next };
}

export async function createSession(userId: string) {
  const token = newToken();
  await prisma.authSession.create({
    data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000) },
  });
  return token;
}

export async function deleteSession(token: string) {
  await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/** The signed-in user for this request, or null. */
export async function getSessionUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.authSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) return null;
  const user = session.user;
  // keep "last seen" fresh, at most once every 10 minutes
  if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > 10 * 60_000) {
    await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
  }
  return user;
}

export function isAdmin(user: Pick<User, "email"> | null): boolean {
  return !!user && user.email.toLowerCase() === adminEmail();
}

/** For pages: the signed-in user, or a redirect to /login. */
export async function requireUser(next = "/dashboard"): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}
