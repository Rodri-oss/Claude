import { prisma } from "@/lib/server/db";
import { HttpError, json, readJson, withOptionalUser } from "@/lib/server/api";
import { normalizeEmail } from "@/lib/server/tokens";
import { visitorCookieOptions, visitorId, VISITOR_COOKIE } from "@/lib/server/visitor";
import { TIERS } from "@/data/pricing";

/** Join the waitlist / early-access list. Idempotent per email. */
export const POST = withOptionalUser(async (req, user) => {
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  if (!email) throw new HttpError(400, "Please enter a valid email address.");
  const source = body.source === "pricing" ? "pricing" : "landing";
  const tier = TIERS.some((t) => t.id === body.tier) ? String(body.tier) : null;
  const vid = await visitorId();
  const existing = await prisma.waitlistEntry.findUnique({ where: { email } });
  if (existing) {
    // keep the first signup, but remember the highest-intent tier they asked for
    if (tier && tier !== existing.tier) await prisma.waitlistEntry.update({ where: { email }, data: { tier } });
  } else {
    await prisma.waitlistEntry.create({ data: { email, source, tier, visitorId: vid.id, userId: user?.id ?? null } });
  }
  const res = json({ ok: true, already: !!existing });
  if (vid.isNew) res.cookies.set(VISITOR_COOKIE, vid.id, visitorCookieOptions);
  return res;
});
