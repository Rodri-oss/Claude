import { prisma } from "@/lib/server/db";
import { HttpError, json, readJson, withOptionalUser } from "@/lib/server/api";
import { visitorCookieOptions, visitorId, VISITOR_COOKIE } from "@/lib/server/visitor";
import { TIERS } from "@/data/pricing";

/** Record which pricing tier a visitor picked. Nobody is ever charged. */
export const POST = withOptionalUser(async (req, user) => {
  const body = await readJson(req);
  if (!TIERS.some((t) => t.id === body.tier)) throw new HttpError(400, "Unknown tier");
  const vid = await visitorId();
  await prisma.pricingClick.create({ data: { tier: String(body.tier), visitorId: vid.id, userId: user?.id ?? null } });
  const res = json({ ok: true });
  if (vid.isNew) res.cookies.set(VISITOR_COOKIE, vid.id, visitorCookieOptions);
  return res;
});
