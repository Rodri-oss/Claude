import type { Metadata } from "next";
import { prisma } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/user";
import { VocabBrowser } from "./VocabBrowser";
import { isLearned } from "@/lib/srs";

export const metadata: Metadata = { title: "Words" };

export default async function VocabPage() {
  const user = await getCurrentUser();
  const [words, cards] = await Promise.all([
    prisma.word.findMany({ orderBy: { rank: "asc" } }),
    prisma.card.findMany({ where: { userId: user.id }, select: { wordId: true, intervalDays: true, reps: true } }),
  ]);
  const status: Record<number, "learning" | "learned"> = {};
  for (const c of cards) status[c.wordId] = isLearned(c) ? "learned" : "learning";
  return <VocabBrowser words={words} status={status} userLevel={user.level} />;
}
