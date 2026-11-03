import { answerCard } from "@/lib/server/review";
import { int, json, readJson, withUser } from "@/lib/server/api";
import type { Rating } from "@/lib/srs";

export const POST = withUser(async (req, user) => {
  const body = await readJson(req);
  const wordId = int(body.wordId, 1, 1_000_000, "wordId");
  const rating = int(body.rating, 1, 4, "rating") as Rating;
  const { card } = await answerCard(user, wordId, rating);
  return json({ intervalDays: card.intervalDays, due: card.due, ease: card.ease, reps: card.reps });
});
