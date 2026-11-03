import { prisma } from "@/lib/server/db";
import { HttpError, json, readJson, withUser } from "@/lib/server/api";
import { SURVEY } from "@/data/survey";
import { shouldShowSurvey } from "@/lib/server/survey";

export const GET = withUser(async (_req, user) => json({ show: await shouldShowSurvey(user) }));

const pick = (v: unknown, opts: readonly { id: string }[], name: string) => {
  if (!opts.some((o) => o.id === v)) throw new HttpError(400, `Please answer: ${name}`);
  return String(v);
};
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export const POST = withUser(async (req, user) => {
  const b = await readJson(req);
  const data = {
    level: pick(b.level, SURVEY.level.options, SURVEY.level.question),
    reason: pick(b.reason, SURVEY.reason.options, SURVEY.reason.question),
    reasonOther: text(b.reasonOther, 200),
    mostUseful: pick(b.mostUseful, SURVEY.mostUseful.options, SURVEY.mostUseful.question),
    wtp: pick(b.wtp, SURVEY.wtp.options, SURVEY.wtp.question),
    comment: text(b.comment, 1000),
  };
  await prisma.surveyResponse.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  return json({ ok: true });
});
