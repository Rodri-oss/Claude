import { prisma } from "@/lib/server/db";
import { json, withUser } from "@/lib/server/api";

/** "Not now": hide the survey until the next study session (at most 3 times). */
export const POST = withUser(async (_req, user) => {
  await prisma.user.update({ where: { id: user.id }, data: { surveyPromptedAt: new Date(), surveyDismissCount: { increment: 1 } } });
  return json({ ok: true });
});
