import "server-only";
import type { User, Word } from "@prisma/client";
import { prisma } from "./db";
import { recordActivity } from "./activity";
import { dayKey, startOfDay } from "../dates";
import { NEW_CARD, previewIntervals, schedule, type Rating } from "../srs";
import { LEVEL_IDS, type LevelId } from "@/data/vocab";

export interface QueueCard {
  wordId: number;
  isNew: boolean;
  word: Word;
  previews: Record<Rating, string>;
}

export async function newCardsIntroducedToday(user: User, now = new Date()) {
  const start = startOfDay(dayKey(now, user.timezone), user.timezone);
  return prisma.card.count({ where: { userId: user.id, introducedAt: { gte: start } } });
}

/**
 * New words in study order: the learner's chosen level first, then the levels
 * above it, then anything below it they skipped. Within a level, by rank.
 */
export function orderNewWords(words: Word[], level: string, deck: string): Word[] {
  const start = Math.max(0, LEVEL_IDS.indexOf(level as LevelId));
  const levelOrder = (l: string) => {
    const i = LEVEL_IDS.indexOf(l as LevelId);
    return i >= start ? i - start : LEVEL_IDS.length + i;
  };
  return words
    .filter((w) => deck === "all" || w.category === deck)
    .sort((a, b) => levelOrder(a.level) - levelOrder(b.level) || a.rank - b.rank);
}

export async function unseenWords(user: User): Promise<Word[]> {
  const seen = await prisma.card.findMany({ where: { userId: user.id }, select: { wordId: true } });
  const seenIds = new Set(seen.map((c) => c.wordId));
  const words = await prisma.word.findMany();
  return orderNewWords(words.filter((w) => !seenIds.has(w.id)), user.level, user.deck);
}

export async function getQueue(user: User, now = new Date()) {
  const due = await prisma.card.findMany({
    where: { userId: user.id, due: { lte: now } },
    orderBy: { due: "asc" },
    include: { word: true },
  });
  const introducedToday = await newCardsIntroducedToday(user, now);
  const newRemaining = Math.max(0, user.newPerDay - introducedToday);
  const fresh = (await unseenWords(user)).slice(0, newRemaining);

  const reviewCards: QueueCard[] = due.map((c) => ({
    wordId: c.wordId,
    isNew: false,
    word: c.word,
    previews: previewIntervals(c),
  }));
  const newCards: QueueCard[] = fresh.map((w) => ({
    wordId: w.id,
    isNew: true,
    word: w,
    previews: previewIntervals(NEW_CARD),
  }));
  // Interleave: one new card after every few reviews so new words don't all land at the end.
  const cards: QueueCard[] = [];
  let ni = 0;
  reviewCards.forEach((rc, i) => {
    cards.push(rc);
    if ((i + 1) % 4 === 0 && ni < newCards.length) cards.push(newCards[ni++]);
  });
  while (ni < newCards.length) cards.push(newCards[ni++]);

  return { cards, dueCount: reviewCards.length, newCount: newCards.length, introducedToday, newPerDay: user.newPerDay };
}

export async function answerCard(user: User, wordId: number, rating: Rating, now = new Date()) {
  const word = await prisma.word.findUnique({ where: { id: wordId } });
  if (!word) throw new Error("Unknown word");
  const existing = await prisma.card.findUnique({ where: { userId_wordId: { userId: user.id, wordId } } });
  const before = existing ?? { ...NEW_CARD };
  const next = schedule(before, rating, now, user.timezone);
  const card = existing
    ? await prisma.card.update({
        where: { id: existing.id },
        data: { ...next, lastReviewedAt: now },
      })
    : await prisma.card.create({
        data: { userId: user.id, wordId, ...next, introducedAt: now, lastReviewedAt: now },
      });
  await prisma.reviewLog.create({
    data: {
      userId: user.id,
      cardId: card.id,
      rating,
      wasNew: !existing,
      intervalBefore: before.intervalDays,
      intervalAfter: next.intervalDays,
      easeAfter: next.ease,
      createdAt: now,
    },
  });
  await recordActivity(user, { reviews: 1, newCards: existing ? 0 : 1 }, now);
  return { card, previews: previewIntervals(card) };
}
