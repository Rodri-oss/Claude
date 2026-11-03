import { prisma } from "@/lib/server/db";
import { HttpError, json, readJson, withUser } from "@/lib/server/api";
import { isValidTimeZone } from "@/lib/dates";
import { CATEGORIES, LEVEL_IDS } from "@/data/vocab";

export const POST = withUser(async (req, user) => {
  const body = await readJson(req);
  const data: Record<string, unknown> = {};
  if ("showPinyin" in body) data.showPinyin = Boolean(body.showPinyin);
  if ("showZhuyin" in body) data.showZhuyin = Boolean(body.showZhuyin);
  if ("timezone" in body) {
    if (typeof body.timezone !== "string" || !isValidTimeZone(body.timezone)) throw new HttpError(400, "Invalid timezone");
    data.timezone = body.timezone;
  }
  if ("newPerDay" in body) {
    const n = Number(body.newPerDay);
    if (!Number.isInteger(n) || n < 0 || n > 50) throw new HttpError(400, "newPerDay must be 0–50");
    data.newPerDay = n;
  }
  if ("level" in body) {
    if (!LEVEL_IDS.includes(body.level as never)) throw new HttpError(400, "Invalid level");
    data.level = body.level;
  }
  if ("deck" in body) {
    if (body.deck !== "all" && !CATEGORIES.some((c) => c.id === body.deck)) throw new HttpError(400, "Invalid deck");
    data.deck = body.deck;
  }
  const updated = await prisma.user.update({ where: { id: user.id }, data });
  return json({
    showPinyin: updated.showPinyin,
    showZhuyin: updated.showZhuyin,
    timezone: updated.timezone,
    newPerDay: updated.newPerDay,
    level: updated.level,
    deck: updated.deck,
  });
});
