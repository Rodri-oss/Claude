import type { Metadata } from "next";
import { prisma } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/user";
import { VocabBrowser } from "./VocabBrowser";

export const metadata: Metadata = { title: "Words" };

export default async function VocabPage() {
  const user = await getCurrentUser();
  const [words, cards] = await Promise.all([
    prisma.word.findMany({ orderBy: { rank: "asc" } }),
    prisma.card.findMany({ where: { userId: user.id }, select: { wordId: true, intervalDays: true, due: true } }),
  ]);
  const status: Record<number, "learning" | "learned"> = {};
  for (const c of cards) status[c.wordId] = c.intervalDays >= 1 ? "learned" : "learning";
  return <VocabBrowser words={words} status={status} userLevel={user.level} />;
}
