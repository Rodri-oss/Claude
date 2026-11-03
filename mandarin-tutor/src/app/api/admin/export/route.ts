import { prisma } from "@/lib/server/db";
import { HttpError, withAdmin } from "@/lib/server/api";

function csv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    let s = v instanceof Date ? v.toISOString() : v == null ? "" : String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s; // avoid spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}

export const GET = withAdmin(async (req) => {
  const kind = new URL(req.url).searchParams.get("kind");
  let rows: Record<string, unknown>[];
  if (kind === "users") {
    rows = (await prisma.user.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { sessions: true, cards: true } } } })).map((u) => ({
      email: u.email, createdAt: u.createdAt, lastSeenAt: u.lastSeenAt, timezone: u.timezone, sessions: u._count.sessions, cards: u._count.cards,
    }));
  } else if (kind === "waitlist") {
    rows = (await prisma.waitlistEntry.findMany({ orderBy: { createdAt: "asc" } })).map((w) => ({ email: w.email, createdAt: w.createdAt, source: w.source, tier: w.tier }));
  } else if (kind === "survey") {
    rows = (await prisma.surveyResponse.findMany({ orderBy: { createdAt: "asc" }, include: { user: { select: { email: true } } } })).map((s) => ({
      email: s.user.email, createdAt: s.createdAt, level: s.level, reason: s.reason, reasonOther: s.reasonOther, mostUseful: s.mostUseful, wtp: s.wtp, comment: s.comment,
    }));
  } else throw new HttpError(400, "kind must be users, waitlist or survey");
  return new Response(csv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${kind}.csv"` },
  });
});
