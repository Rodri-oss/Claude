import { describe, expect, it } from "vitest";
import { buildVocab, CATEGORIES } from "@/data/vocab";
import { countHan, syllables } from "@/lib/pinyin";
import { PAIR_SETS, TONE_ITEMS } from "@/data/tones";

const vocab = buildVocab();

describe("seed vocabulary", () => {
  it("has exactly 300 words", () => {
    expect(vocab).toHaveLength(300);
  });

  it("has no duplicate headwords", () => {
    const seen = new Map<string, number>();
    for (const v of vocab) seen.set(v.hanzi, (seen.get(v.hanzi) ?? 0) + 1);
    expect([...seen].filter(([, n]) => n > 1)).toEqual([]);
  });

  it("covers every themed set", () => {
    const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, vocab.filter((v) => v.category === c.id).length]));
    expect(counts).toEqual({ core: 180, campus: 30, food: 30, mrt: 25, tech: 35 });
  });

  it("headword pinyin has one syllable per character", () => {
    const bad = vocab.filter((v) => syllables(v.pinyinNum).length !== countHan(v.hanzi));
    expect(bad.map((v) => `${v.hanzi} ${v.pinyinNum}`)).toEqual([]);
  });

  it("example pinyin has one syllable per character", () => {
    const bad = vocab.filter((v) => syllables(v.exPinyinNum).length !== countHan(v.exZh));
    expect(bad.map((v) => `${v.exZh} | ${v.exPinyinNum}`)).toEqual([]);
  });

  it("each example contains its headword", () => {
    const bad = vocab.filter((v) => !v.exZh.includes(v.hanzi));
    expect(bad.map((v) => `${v.hanzi}: ${v.exZh}`)).toEqual([]);
  });

  it("example pinyin agrees with headword pinyin where the word appears", () => {
    const bad: string[] = [];
    for (const v of vocab) {
      const idx = Array.from(v.exZh.replace(/[^\p{Script=Han}]/gu, "")).join("").indexOf(v.hanzi);
      const exSyl = syllables(v.exPinyinNum);
      const wSyl = syllables(v.pinyinNum);
      const slice = exSyl.slice(idx, idx + wSyl.length);
      const same = slice.every((s, i) => s.base === wSyl[i].base && s.tone === wSyl[i].tone);
      if (!same) bad.push(`${v.hanzi} (${v.pinyinNum}) in ${v.exZh} → ${slice.map((s) => s.base + s.tone).join(" ")}`);
    }
    // 個 is gè as a headword but neutral "ge" inside sentences, by convention.
    expect(bad.filter((b) => !b.startsWith("個"))).toEqual([]);
  });

  it("uses Traditional characters (no common Simplified forms)", () => {
    const simplified = /[们这说话吗来还时间学书东车会对开关门问见经过么钱买卖习电脑网络软资图馆题号码账读认识岁]/u;
    const bad = vocab.filter((v) => simplified.test(v.hanzi + v.exZh));
    expect(bad.map((v) => v.hanzi + " " + v.exZh)).toEqual([]);
  });
});

describe("tone drill data", () => {
  it("has items for all five tones", () => {
    for (const t of [1, 2, 3, 4, 5]) expect(TONE_ITEMS.filter((i) => i.tone === t).length).toBeGreaterThanOrEqual(15);
  });
  it("item tones match their pinyin", () => {
    for (const it of TONE_ITEMS) {
      expect(syllables(it.pinyinNum)[it.target].tone).toBe(it.tone);
      expect(syllables(it.pinyinNum).length).toBe(countHan(it.text));
    }
  });
  it("minimal pair options differ only in tone on the diff syllable", () => {
    for (const s of PAIR_SETS) {
      const bases = s.options.map((o) => syllables(o.pinyinNum).map((x) => x.base).join(" "));
      expect(new Set(bases).size).toBe(1);
      const tones = s.options.map((o) => syllables(o.pinyinNum)[s.diffSyllable].tone);
      expect(new Set(tones).size).toBe(s.options.length);
    }
  });
});
