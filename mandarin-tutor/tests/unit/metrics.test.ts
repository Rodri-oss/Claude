import { describe, expect, it } from "vitest";
import { activeDaysByUser, countBy, dailyActiveUsers, retention, retentionCohorts, weekStart } from "@/lib/metrics";

const tz = "UTC";
const now = new Date("2026-03-20T12:00:00Z");
const users = [
  { id: "a", createdAt: new Date("2026-03-01T10:00:00Z"), timezone: tz }, // active d1 and d7
  { id: "b", createdAt: new Date("2026-03-02T10:00:00Z"), timezone: tz }, // active d3 only
  { id: "c", createdAt: new Date("2026-03-03T10:00:00Z"), timezone: tz }, // never came back
  { id: "d", createdAt: new Date("2026-03-18T10:00:00Z"), timezone: tz }, // too new for D7, active d1
];
const rows = [
  { userId: "a", date: "2026-03-01" },
  { userId: "a", date: "2026-03-02" },
  { userId: "a", date: "2026-03-08" },
  { userId: "b", date: "2026-03-02" },
  { userId: "b", date: "2026-03-05" },
  { userId: "c", date: "2026-03-03" },
  { userId: "d", date: "2026-03-18" },
  { userId: "d", date: "2026-03-19" },
];

describe("metrics", () => {
  it("counts distinct daily active users", () => {
    expect(dailyActiveUsers(rows, ["2026-03-02", "2026-03-04"])).toEqual([
      { date: "2026-03-02", users: 2 },
      { date: "2026-03-04", users: 0 },
    ]);
  });

  it("computes D1, D7 and week-1 retention", () => {
    const r = retention(users, activeDaysByUser(rows), now);
    expect(r.eligible).toBe(3); // d is too new
    expect(r.d7).toBe(1);
    expect(r.d7Rate).toBeCloseTo(1 / 3);
    expect(r.week1).toBe(2); // a and b came back within a week
    expect(r.d1).toBe(2); // a and d
    expect(r.d1Rate).toBeCloseTo(2 / 4);
  });

  it("returns null rates with no eligible users", () => {
    expect(retention([users[3]], activeDaysByUser(rows), now).d7Rate).toBeNull();
  });

  it("groups cohorts by signup week (Monday start)", () => {
    expect(weekStart("2026-03-04")).toBe("2026-03-02"); // Wednesday → Monday
    expect(weekStart("2026-03-02")).toBe("2026-03-02");
    const c = retentionCohorts(users, activeDaysByUser(rows), now);
    expect(c.map((x) => [x.week, x.users])).toEqual([
      ["2026-03-16", 1],
      ["2026-03-02", 2],
      ["2026-02-23", 1],
    ]);
  });

  it("counts by key", () => {
    expect(countBy(["pro", "pro", "free"], (x) => x)).toEqual({ pro: 2, free: 1 });
  });
});
