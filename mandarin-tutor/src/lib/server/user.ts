import "server-only";
import type { User } from "@prisma/client";

export function adminEmail(): string {
  return (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
}

/**
 * The signed-in learner. (In Phase 1 this was a single local user whose email
 * was ADMIN_EMAIL; signing in with that email now keeps all that progress.)
 */
export async function getCurrentUser(): Promise<User> {
  const { requireUser } = await import("./auth");
  return requireUser();
}
