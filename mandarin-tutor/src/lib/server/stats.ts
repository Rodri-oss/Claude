import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { computeStreak, dayKey, lastNDays, longestStreak, startOfDay, addDays } from "../dates";
import { toneStats, weakestTone, topConfusion, type ToneStat } from "../toneStats";
import { newCardsIntroducedToday, unseenWords } from "./review";
import { suggestSession } from "../plan";
import type { Tone } from "../pinyin";

export const TONE_WINDOW = 500;

export async function getToneStats(user: User) {
  const attempts = await prisma.toneAttempt.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: TONE_WINDOW,
    select: { expectedTone: true, answeredTone: true, correct: true },
  });
  const stats = toneStats(attempts);
  const weakest = weakestTone(stats);
  const confusedWith = weakest ? topConfusion(attempts, weakest) : null;
  return { stats, weakest, confusedWith, total: attempts.length };
}

export interface DayActivity {
  date: string;
  reviews: number;
  toneDrills: number;
  shadowing: number;
  newCards: number;
  minutes: number;
}

export async function getDashboard(user: User, now = new Date()) {
  const tz = user.timezone;
  const today = dayKey(now, tz);
  const endOfToday = startOfDay(addDays(today, 1), tz);

  const [days, dueNow, dueToday, introduced, learned, totalWords, introducedToday, unseen, tones] = await Promise.all([
    prisma.activityDay.findMany({ where: { userId: user.id }, orderBy: { date: "asc" } }),
    prisma.card.count({ where: { userId: user.id, due: { lte: now } } }),
    prisma.card.count({ where: { userId: user.id, due: { lte: endOfToday } } }),
    prisma.card.count({ where: { userId: user.id } }),
    prisma.card.count({ where: { userId: user.id, intervalDays: { gte: 1 } } }),
    prisma.word.count(),
    newCardsIntroducedToday(user, now),
    unseenWords(user),
    getToneStats(user),
  ]);

  const activeDates = days
    .filter((d) => d.reviews + d.toneDrills + d.shadowing > 0)
    .map((d) => d.date);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const last30: DayActivity[] = lastNDays(today, 30).map((date) => {
    const d = byDate.get(date);
    return {
      date,
      reviews: d?.reviews ?? 0,
      toneDrills: d?.toneDrills ?? 0,
      shadowing: d?.shadowing ?? 0,
      newCards: d?.newCards ?? 0,
      minutes: Math.round((d?.activeSeconds ?? 0) / 60),
    };
  });
  const todayRow = byDate.get(today);
  const newAvailable = Math.min(Math.max(0, user.newPerDay - introducedToday), unseen.length);

  const plan = suggestSession({
    dueCount: dueNow,
    newAvailable,
    weakest: tones.weakest,
    today: {
      reviews: (todayRow?.reviews ?? 0) - (todayRow?.newCards ?? 0),
      newCards: todayRow?.newCards ?? 0,
      toneDrills: todayRow?.toneDrills ?? 0,
      shadowing: todayRow?.shadowing ?? 0,
    },
  });

  return {
    today,
    streak: computeStreak(activeDates, today),
    longestStreak: longestStreak(activeDates),
    wordsLearned: learned,
    wordsIntroduced: introduced,
    totalWords,
    dueNow,
    dueLaterToday: Math.max(0, dueToday - dueNow),
    newAvailable,
    minutesToday: Math.round((todayRow?.activeSeconds ?? 0) / 60),
    last30,
    tones: tones as { stats: ToneStat[]; weakest: Tone | null; confusedWith: Tone | null; total: number },
    plan,
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
