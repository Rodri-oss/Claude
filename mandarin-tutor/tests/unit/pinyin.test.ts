import { describe, expect, it } from "vitest";
import { contourFor, toToneMarks, toZhuyin, tonesOf, isValidSyllable } from "@/lib/pinyin";

describe("tone marks", () => {
  it.each([
    ["ma1", "mā"], ["ma2", "má"], ["ma3", "mǎ"], ["ma4", "mà"], ["ma5", "ma"],
    ["xue2sheng1", "xuéshēng"], ["gui4", "guì"], ["liu4", "liù"], ["lv3", "lǚ"],
    ["zao3an1", "zǎo'ān"], ["Tai2wan1", "Táiwān"], ["dou1", "dōu"], ["nü3", "nǚ"],
    ["Wo3 shi4 xue2sheng1.", "Wǒ shì xuéshēng."],
  ])("%s → %s", (input, expected) => {
    expect(toToneMarks(input)).toBe(expected);
  });
});

describe("zhuyin", () => {
  it.each([
    ["ma1", "ㄇㄚ"], ["ma2", "ㄇㄚˊ"], ["ma3", "ㄇㄚˇ"], ["ma4", "ㄇㄚˋ"], ["ma5", "˙ㄇㄚ"],
    ["shi4", "ㄕˋ"], ["zi4", "ㄗˋ"], ["ri4", "ㄖˋ"], ["xue2", "ㄒㄩㄝˊ"], ["qu4", "ㄑㄩˋ"],
    ["jiong3", "ㄐㄩㄥˇ"], ["yi1", "ㄧ"], ["you3", "ㄧㄡˇ"], ["wo3", "ㄨㄛˇ"], ["yuan3", "ㄩㄢˇ"],
    ["gui4", "ㄍㄨㄟˋ"], ["liu4", "ㄌㄧㄡˋ"], ["dun1", "ㄉㄨㄣ"], ["lü4", "ㄌㄩˋ"], ["bo1", "ㄅㄛ"],
    ["zhong1", "ㄓㄨㄥ"], ["er4", "ㄦˋ"], ["an1", "ㄢ"],
    ["xue2sheng1", "ㄒㄩㄝˊ ㄕㄥ"],
    ["Ni3 hao3 ma5?", "ㄋㄧˇ ㄏㄠˇ ˙ㄇㄚ？"],
  ])("%s → %s", (input, expected) => {
    expect(toZhuyin(input)).toBe(expected);
  });

  it("rejects invalid syllables", () => {
    expect(isValidSyllable("xa")).toBe(false);
    expect(isValidSyllable("gi")).toBe(false);
    expect(isValidSyllable("bü")).toBe(false);
    expect(() => toZhuyin("hello")).toThrow();
  });
});

describe("tones & contours", () => {
  it("extracts tones", () => {
    expect(tonesOf("ni3hao3 ma5")).toEqual([3, 3, 5]);
  });
  it("applies 3-3 sandhi and half-third", () => {
    const c = contourFor([3, 3]);
    expect(c[0]).toEqual([3, 5]); // 2nd tone
    expect(c[1]).toEqual([2, 1, 4]); // full third at the end
    expect(contourFor([3, 1])[0]).toEqual([2, 1]); // half third
  });
});
