import "server-only";
import { prisma } from "./db";
import { adminEmail } from "./user";
import { dayKey, lastNDays } from "../dates";
import { activeDaysByUser, countBy, dailyActiveUsers, retention, retentionCohorts } from "../metrics";
import { TIERS } from "@/data/pricing";
import { SURVEY } from "@/data/survey";

const ADMIN_TZ = "Asia/Taipei";

/** Everything the admin page shows. The admin's own account is excluded unless includeAdmin. */
export async function getAdminData(includeAdmin = false, now = new Date()) {
  const admin = adminEmail();
  const userWhere = includeAdmin || !admin ? {} : { email: { not: admin } };
  const users = await prisma.user.findMany({
    where: userWhere,
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, createdAt: true, timezone: true, lastSeenAt: true, _count: { select: { sessions: true, cards: true } } },
  });
  const ids = users.map((u) => u.id);
  const [activity, waitlist, clicks, surveys] = await Promise.all([
    prisma.activityDay.findMany({ where: { userId: { in: ids } }, select: { userId: true, date: true } }),
    prisma.waitlistEntry.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.pricingClick.findMany({ where: includeAdmin ? {} : { OR: [{ userId: null }, { userId: { in: ids } }] } }),
    prisma.surveyResponse.findMany({ where: { userId: { in: ids } }, orderBy: { createdAt: "desc" }, include: { user: { select: { email: true } } } }),
  ]);

  const today = dayKey(now, ADMIN_TZ);
  const days30 = lastNDays(today, 30);
  const active = activeDaysByUser(activity);
  const dau = dailyActiveUsers(activity, days30);
  const signupsByDay = countBy(users, (u) => dayKey(u.createdAt, ADMIN_TZ));
  const waitlistByDay = countBy(waitlist, (w) => dayKey(w.createdAt, ADMIN_TZ));
  const sevenAgo = new Date(now.getTime() - 7 * 86400_000);

  const pricing = TIERS.map((t) => {
    const mine = clicks.filter((c) => c.tier === t.id);
    const visitors = new Set(mine.map((c) => c.visitorId)).size;
    const earlyAccess = waitlist.filter((w) => w.tier === t.id).length;
    return { id: t.id, name: t.name, price: t.price, clicks: mine.length, visitors, earlyAccess };
  });

  const survey = (Object.keys(SURVEY) as (keyof typeof SURVEY)[]).map((key) => {
    const counts = countBy(surveys, (s) => s[key]);
    return {
      key,
      question: SURVEY[key].question,
      options: SURVEY[key].options.map((o) => ({ id: o.id, label: o.label, count: counts[o.id] ?? 0 })),
    };
  });

  return {
    today,
    totals: {
      users: users.length,
      newUsers7d: users.filter((u) => u.createdAt >= sevenAgo).length,
      waitlist: waitlist.length,
      waitlistFromPricing: waitlist.filter((w) => w.source === "pricing").length,
      dauToday: dau[dau.length - 1].users,
      dauAvg7: dau.slice(-7).reduce((a, d) => a + d.users, 0) / 7,
      wau: new Set(activity.filter((a) => a.date >= days30[23]).map((a) => a.userId)).size,
      surveys: surveys.length,
      paidClicks: clicks.filter((c) => c.tier !== "free").length,
    },
    signups: days30.map((date) => ({ date, accounts: signupsByDay[date] ?? 0, waitlist: waitlistByDay[date] ?? 0 })),
    dau,
    retention: retention(users, active, now),
    cohorts: retentionCohorts(users, active, now).slice(0, 8),
    pricing,
    survey,
    surveyRows: surveys.map((s) => ({ ...s, email: s.user.email })),
    users: users.slice(0, 50).map((u) => ({
      email: u.email,
      createdAt: u.createdAt,
      lastSeenAt: u.lastSeenAt,
      sessions: u._count.sessions,
      cards: u._count.cards,
      activeDays: active.get(u.id)?.size ?? 0,
    })),
    waitlist: waitlist.slice(0, 50),
    includeAdmin,
  };
}

export type AdminData = Awaited<ReturnType<typeof getAdminData>>;
