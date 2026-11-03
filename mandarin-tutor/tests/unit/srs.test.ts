import { describe, expect, it } from "vitest";
import { NEW_CARD, nextEase, previewIntervals, schedule } from "@/lib/srs";
import { dayKey } from "@/lib/dates";

const tz = "Asia/Taipei";
const now = new Date("2026-03-10T13:00:00Z"); // 21:00 in Taipei

describe("SM-2", () => {
  it("ease follows the SM-2 formula", () => {
    expect(nextEase(2.5, 4)).toBe(2.6); // Easy, q=5
    expect(nextEase(2.5, 3)).toBe(2.5); // Good, q=4
    expect(nextEase(2.5, 2)).toBe(2.36); // Hard, q=3
    expect(nextEase(2.5, 1)).toBe(2.3); // Again
    expect(nextEase(1.3, 1)).toBe(1.3); // floor
  });

  it("first Good → 1 day, second → 6 days, third → 6×EF", () => {
    const a = schedule(NEW_CARD, 3, now, tz);
    expect(a.intervalDays).toBe(1);
    const b = schedule(a, 3, now, tz);
    expect(b.intervalDays).toBe(6);
    const c = schedule(b, 3, now, tz);
    expect(c.intervalDays).toBe(15);
    expect(c.reps).toBe(3);
  });

  it("Again resets reps, counts a lapse and re-shows in 10 minutes", () => {
    const learned = { ease: 2.5, intervalDays: 15, reps: 3, lapses: 0 };
    const r = schedule(learned, 1, now, tz);
    expect(r.reps).toBe(0);
    expect(r.lapses).toBe(1);
    expect(r.intervalDays).toBe(0);
    expect(r.due.getTime() - now.getTime()).toBe(10 * 60000);
  });

  it("Again on a brand-new card is not a lapse", () => {
    expect(schedule(NEW_CARD, 1, now, tz).lapses).toBe(0);
  });

  it("button ordering: Hard < Good < Easy", () => {
    const st = { ease: 2.5, intervalDays: 10, reps: 3, lapses: 0 };
    const h = schedule(st, 2, now, tz).intervalDays;
    const g = schedule(st, 3, now, tz).intervalDays;
    const e = schedule(st, 4, now, tz).intervalDays;
    expect(h).toBeLessThan(g);
    expect(g).toBeLessThan(e);
  });

  it("due dates land on local midnight", () => {
    const r = schedule(NEW_CARD, 3, now, tz);
    expect(dayKey(r.due, tz)).toBe("2026-03-11");
    expect(r.due.toISOString()).toBe("2026-03-10T16:00:00.000Z"); // 00:00 Taipei (UTC+8)
  });

  it("previews labels for each button", () => {
    expect(previewIntervals(NEW_CARD)).toEqual({ 1: "10m", 2: "1d", 3: "1d", 4: "4d" });
  });
});
