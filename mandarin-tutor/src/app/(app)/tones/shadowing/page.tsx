import type { Metadata } from "next";
import { prisma } from "@/lib/server/db";
import { getCurrentUser } from "@/lib/server/user";
import { orderNewWords } from "@/lib/server/review";
import { Shadowing } from "./Shadowing";

export const metadata: Metadata = { title: "Shadowing" };

/** Sentences from words you're learning first, then upcoming words at your level. */
export default async function ShadowingPage() {
  const user = await getCurrentUser();
  const cards = await prisma.card.findMany({
    where: { userId: user.id },
    orderBy: { lastReviewedAt: "desc" },
    take: 15,
    include: { word: true },
  });
  const known = cards.map((c) => c.word);
  const ids = new Set(known.map((w) => w.id));
  const upcoming = orderNewWords(await prisma.word.findMany(), user.level, "all").filter((w) => !ids.has(w.id));
  const sentences = [...known, ...upcoming].slice(0, 25);
  return <Shadowing sentences={sentences} />;
}
