import { describe, expect, it } from "vitest";
import { addDays, computeStreak, dayKey, lastNDays, longestStreak, startOfDay } from "@/lib/dates";

describe("dates", () => {
  it("day keys respect time zone", () => {
    const d = new Date("2026-03-10T20:00:00Z");
    expect(dayKey(d, "Asia/Taipei")).toBe("2026-03-11");
    expect(dayKey(d, "America/New_York")).toBe("2026-03-10");
  });
  it("startOfDay handles DST", () => {
    expect(startOfDay("2026-03-08", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(startOfDay("2026-03-09", "America/New_York").toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });
  it("adds days across months", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(lastNDays("2026-03-02", 3)).toEqual(["2026-02-28", "2026-03-01", "2026-03-02"]);
  });
  it("streak counts through yesterday if today is empty", () => {
    const days = ["2026-03-07", "2026-03-08", "2026-03-09"];
    expect(computeStreak(days, "2026-03-10")).toBe(3);
    expect(computeStreak([...days, "2026-03-10"], "2026-03-10")).toBe(4);
    expect(computeStreak(days, "2026-03-11")).toBe(0);
    expect(longestStreak(["2026-01-01", "2026-01-02", "2026-01-05"])).toBe(2);
  });
});
