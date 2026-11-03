import "server-only";
import type { User } from "@prisma/client";
import { connection } from "next/server";
import { prisma } from "./db";

export function adminEmail(): string {
  return (process.env.ADMIN_EMAIL || "me@localhost").trim().toLowerCase();
}

/**
 * Phase 1 is single-learner: everything is stored under the user whose email
 * is ADMIN_EMAIL. (Phase 2 replaces this with a signed-in session; signing in
 * with the same email keeps all this progress.)
 */
export async function getCurrentUser(): Promise<User> {
  await connection(); // per-request data: never prerender at build time
  const email = adminEmail();
  return prisma.user.upsert({ where: { email }, update: {}, create: { email } });
}
