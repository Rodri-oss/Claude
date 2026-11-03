import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { dayKey } from "../dates";

export type ActivityCounters = Partial<Record<"reviews" | "newCards" | "toneDrills" | "shadowing", number>>;

export const SESSION_GAP_MS = 30 * 60 * 1000;
/** Time between two actions counted as study time, at most. */
const MAX_CREDIT_MS = 2 * 60 * 1000;
/** Credit given for the first action of a session. */
const FIRST_ACTION_CREDIT_MS = 15 * 1000;

/**
 * Record study activity: bumps today's counters (in the learner's time zone)
 * and extends — or starts — the current study session.
 */
export async function recordActivity(user: User, counters: ActivityCounters, now = new Date()) {
  const last = await prisma.studySession.findFirst({
    where: { userId: user.id },
    orderBy: { lastActiveAt: "desc" },
  });
  let creditMs: number;
  if (last && now.getTime() - last.lastActiveAt.getTime() <= SESSION_GAP_MS) {
    creditMs = Math.min(MAX_CREDIT_MS, Math.max(0, now.getTime() - last.lastActiveAt.getTime()));
    await prisma.studySession.update({ where: { id: last.id }, data: { lastActiveAt: now } });
  } else {
    creditMs = FIRST_ACTION_CREDIT_MS;
    await prisma.studySession.create({ data: { userId: user.id, startedAt: now, lastActiveAt: now } });
  }
  const date = dayKey(now, user.timezone);
  const inc = {
    reviews: counters.reviews ?? 0,
    newCards: counters.newCards ?? 0,
    toneDrills: counters.toneDrills ?? 0,
    shadowing: counters.shadowing ?? 0,
    activeSeconds: Math.round(creditMs / 1000),
  };
  await prisma.activityDay.upsert({
    where: { userId_date: { userId: user.id, date } },
    create: { userId: user.id, date, ...inc },
    update: Object.fromEntries(Object.entries(inc).map(([k, v]) => [k, { increment: v }])),
  });
}
