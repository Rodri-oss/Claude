import { expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

export const LEARNER = "learner@example.com"; // also ADMIN_EMAIL in the e2e server

/** Sign in through the real magic-link endpoints (dev mode returns the link). */
export async function login(page: Page, email: string) {
  const res = await page.request.post("/api/auth/request", { data: { email } });
  expect(res.ok()).toBeTruthy();
  const { devLink } = await res.json();
  const token = new URL(devLink).searchParams.get("token");
  const verify = await page.request.post("/api/auth/verify", { data: { token } });
  expect(verify.ok()).toBeTruthy();
}

let db: PrismaClient | null = null;
/** Direct access to the e2e database, for setting up hard-to-reach states. */
export function e2eDb() {
  if (!db) db = new PrismaClient({ datasources: { db: { url: "file:./e2e.db" } } });
  return db;
}
