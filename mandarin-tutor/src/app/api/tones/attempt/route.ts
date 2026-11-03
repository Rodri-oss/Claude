import { prisma } from "@/lib/server/db";
import { recordActivity } from "@/lib/server/activity";
import { getToneStats } from "@/lib/server/stats";
import { HttpError, int, json, readJson, withUser } from "@/lib/server/api";

export const POST = withUser(async (req, user) => {
  const body = await readJson(req);
  const exercise = body.exercise;
  if (exercise !== "tone-id" && exercise !== "minimal-pair") throw new HttpError(400, "Invalid exercise");
  const expectedTone = int(body.expectedTone, 1, 5, "expectedTone");
  const answeredTone = int(body.answeredTone, 1, 5, "answeredTone");
  const prompt = String(body.prompt ?? "").slice(0, 64);
  await prisma.toneAttempt.create({
    data: { userId: user.id, exercise, prompt, expectedTone, answeredTone, correct: expectedTone === answeredTone },
  });
  await recordActivity(user, { toneDrills: 1 });
  const stats = await getToneStats(user);
  return json(stats);
});
