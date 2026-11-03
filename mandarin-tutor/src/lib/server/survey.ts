import "server-only";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { SURVEY_AFTER_SESSIONS, SURVEY_MAX_DISMISSALS } from "@/data/survey";

/**
 * Show the survey once a learner has had 5 study sessions, unless they've
 * answered it, dismissed it 3 times, or already dismissed it this session.
 */
export async function shouldShowSurvey(user: User): Promise<boolean> {
  if (user.surveyDismissCount >= SURVEY_MAX_DISMISSALS) return false;
  if (await prisma.surveyResponse.findUnique({ where: { userId: user.id }, select: { id: true } })) return false;
  const count = await prisma.studySession.count({ where: { userId: user.id } });
  if (count < SURVEY_AFTER_SESSIONS) return false;
  if (user.surveyPromptedAt) {
    const latest = await prisma.studySession.findFirst({ where: { userId: user.id }, orderBy: { startedAt: "desc" } });
    if (latest && user.surveyPromptedAt >= latest.startedAt) return false;
  }
  return true;
}
