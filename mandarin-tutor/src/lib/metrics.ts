/**
 * Demand-test metrics, as pure functions over plain rows so they're testable.
 * "Active" on a day = did any study activity that day (reviews, tone drills or
 * shadowing), using each learner's own time zone.
 */
import { addDays, daysBetween, dayKey } from "./dates";

export interface MetricUser {
  id: string;
  createdAt: Date;
  timezone: string;
}

export interface ActiveRow {
  userId: string;
  date: string; // YYYY-MM-DD in the user's time zone
}

export function activeDaysByUser(rows: ActiveRow[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!m.has(r.userId)) m.set(r.userId, new Set());
    m.get(r.userId)!.add(r.date);
  }
  return m;
}

export function dailyActiveUsers(rows: ActiveRow[], days: string[]): { date: string; users: number }[] {
  const byDate = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, new Set());
    byDate.get(r.date)!.add(r.userId);
  }
  return days.map((date) => ({ date, users: byDate.get(date)?.size ?? 0 }));
}

export function signupDay(u: MetricUser): string {
  return dayKey(u.createdAt, u.timezone);
}

export interface RetentionResult {
  /** users who signed up at least 7 days ago */
  eligible: number;
  /** active exactly on day 1 / day 7 after signup */
  d1: number;
  d7: number;
  /** came back on any day 1–7 after signup */
  week1: number;
  d1Rate: number | null;
  d7Rate: number | null;
  week1Rate: number | null;
}

/**
 * Classic N-day retention. Day 0 is the signup day (in the user's time zone).
 * D7 = share of users (signed up ≥ 7 days ago) who were active on day 7.
 * D1 uses users who signed up ≥ 1 day ago.
 */
export function retention(users: MetricUser[], active: Map<string, Set<string>>, now: Date): RetentionResult {
  let eligible1 = 0, eligible7 = 0, d1 = 0, d7 = 0, week1 = 0;
  for (const u of users) {
    const start = signupDay(u);
    const today = dayKey(now, u.timezone);
    const age = daysBetween(start, today);
    const days = active.get(u.id) ?? new Set();
    if (age >= 1) {
      eligible1++;
      if (days.has(addDays(start, 1))) d1++;
    }
    if (age >= 7) {
      eligible7++;
      if (days.has(addDays(start, 7))) d7++;
      if ([1, 2, 3, 4, 5, 6, 7].some((n) => days.has(addDays(start, n)))) week1++;
    }
  }
  const rate = (n: number, d: number) => (d ? n / d : null);
  return { eligible: eligible7, d1, d7, week1, d1Rate: rate(d1, eligible1), d7Rate: rate(d7, eligible7), week1Rate: rate(week1, eligible7) };
}

/** Monday of the week containing `day`. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Mon=0
  return addDays(day, -dow);
}

export function retentionCohorts(users: MetricUser[], active: Map<string, Set<string>>, now: Date) {
  const groups = new Map<string, MetricUser[]>();
  for (const u of users) {
    const w = weekStart(signupDay(u));
    if (!groups.has(w)) groups.set(w, []);
    groups.get(w)!.push(u);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([week, us]) => ({ week, users: us.length, ...retention(us, active, now) }));
}

export function countBy<T>(rows: T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[key(r)] = (out[key(r)] ?? 0) + 1;
  return out;
}

export function pct(n: number | null | undefined, digits = 0): string {
  return n == null ? "—" : `${(n * 100).toFixed(digits)}%`;
}
