import { prisma } from "@/lib/server/db";
import { recordActivity } from "@/lib/server/activity";
import { HttpError, int, json, readJson, withUser } from "@/lib/server/api";

export const POST = withUser(async (req, user) => {
  const body = await readJson(req);
  const wordId = int(body.wordId, 1, 1_000_000, "wordId");
  const rating = int(body.rating, 1, 4, "rating");
  if (!(await prisma.word.findUnique({ where: { id: wordId } }))) throw new HttpError(404, "Unknown sentence");
  await prisma.shadowAttempt.create({ data: { userId: user.id, wordId, rating } });
  await recordActivity(user, { shadowing: 1 });
  return json({ ok: true });
});
