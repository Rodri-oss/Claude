import { describe, expect, it } from "vitest";
import { pickTone, toneStats, topConfusion, weakestTone } from "@/lib/toneStats";
import { suggestSession } from "@/lib/plan";
import { detectPitch, pitchTrack } from "@/lib/audio/pitch";

const att = (expectedTone: number, answeredTone: number) => ({ expectedTone, answeredTone, correct: expectedTone === answeredTone });

describe("tone stats", () => {
  const attempts = [
    ...Array(10).fill(att(1, 1)),
    ...Array(8).fill(att(2, 2)), att(2, 3), att(2, 3),
    ...Array(4).fill(att(3, 3)), ...Array(6).fill(att(3, 2)),
    ...Array(10).fill(att(4, 4)),
  ];
  it("computes per-tone accuracy", () => {
    const s = toneStats(attempts);
    expect(s.find((x) => x.tone === 3)).toMatchObject({ attempts: 10, correct: 4, accuracy: 0.4 });
    expect(s.find((x) => x.tone === 5)).toMatchObject({ attempts: 0, accuracy: null });
  });
  it("finds the weakest tone and its most common confusion", () => {
    expect(weakestTone(toneStats(attempts))).toBe(3);
    expect(topConfusion(attempts, 3)).toBe(2);
  });
  it("needs enough data and a real weakness", () => {
    expect(weakestTone(toneStats([att(3, 2), att(3, 2)]))).toBeNull();
    expect(weakestTone(toneStats(Array(50).fill(att(1, 1))))).toBeNull();
  });
  it("focus drills target the focus tone ~60% of the time", () => {
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const picks = Array.from({ length: 5000 }, () => pickTone(3, rand));
    const share = picks.filter((t) => t === 3).length / picks.length;
    expect(share).toBeGreaterThan(0.62);
    expect(share).toBeLessThan(0.74); // 0.6 + 0.4 × 1/5 = 0.68
  });
});

describe("suggested session", () => {
  it("adds up to 20 minutes and includes all parts", () => {
    const plan = suggestSession({ dueCount: 30, newAvailable: 10, weakest: 3, today: { reviews: 0, newCards: 0, toneDrills: 0, shadowing: 0 } });
    expect(plan.reduce((a, s) => a + s.minutes, 0)).toBe(20);
    expect(plan.map((s) => s.id)).toEqual(["tones", "review", "new", "shadow"]);
    expect(plan[0].href).toBe("/tones/identify?focus=3");
  });
  it("drops empty steps and gives the time to shadowing", () => {
    const plan = suggestSession({ dueCount: 0, newAvailable: 0, weakest: null, today: { reviews: 0, newCards: 0, toneDrills: 0, shadowing: 0 } });
    expect(plan.map((s) => s.id)).toEqual(["tones", "shadow"]);
    expect(plan.reduce((a, s) => a + s.minutes, 0)).toBe(20);
  });
});

describe("pitch detection", () => {
  it("finds the frequency of a sine wave", () => {
    const sr = 16000;
    const tone = new Float32Array(sr / 10).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 180 * i) / sr));
    expect(detectPitch(tone, sr)).toBeGreaterThan(175);
    expect(detectPitch(tone, sr)).toBeLessThan(185);
  });
  it("treats silence as unvoiced and tracks a glide", () => {
    const sr = 16000;
    expect(detectPitch(new Float32Array(640), sr)).toBeNull();
    // rising glide 120 → 240 Hz over 0.5 s
    let phase = 0;
    const glide = new Float32Array(sr / 2).map((_, i) => {
      const f = 120 + (120 * i) / (sr / 2);
      phase += (2 * Math.PI * f) / sr;
      return 0.5 * Math.sin(phase);
    });
    const track = pitchTrack(glide, sr).filter((p) => p.hz);
    expect(track[0].hz!).toBeLessThan(track[track.length - 1].hz!);
  });
});
