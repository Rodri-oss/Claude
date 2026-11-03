import { toToneMarks, toZhuyin } from "@/lib/pinyin";
import { CORE } from "./vocab-core";
import { CAMPUS, FOOD, MRT, TECH } from "./vocab-themes";

/**
 * TOCFL levels. Novice ("準備級") comes first; levels for themed words are
 * approximate (based on the TOCFL 8000-word list where the word appears, and
 * on difficulty otherwise — most IT/security terms are above Band A).
 */
export const LEVELS = [
  { id: "N1", name: "Novice 1", zh: "準備一級", band: "Novice" },
  { id: "N2", name: "Novice 2", zh: "準備二級", band: "Novice" },
  { id: "A1", name: "Level 1", zh: "入門級", band: "Band A" },
  { id: "A2", name: "Level 2", zh: "基礎級", band: "Band A" },
  { id: "B1", name: "Level 3", zh: "進階級", band: "Band B" },
  { id: "B2", name: "Level 4", zh: "高階級", band: "Band B" },
] as const;
export type LevelId = (typeof LEVELS)[number]["id"];
export const LEVEL_IDS = LEVELS.map((l) => l.id) as LevelId[];

export const CATEGORIES = [
  { id: "core", name: "Core", emoji: "⭐" },
  { id: "campus", name: "Campus life", emoji: "🎓" },
  { id: "food", name: "Food", emoji: "🍜" },
  { id: "mrt", name: "MRT & transport", emoji: "🚇" },
  { id: "tech", name: "IT & cybersecurity", emoji: "🔐" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];

export interface VocabEntry {
  hanzi: string;
  pinyinNum: string;
  pinyin: string;
  zhuyin: string;
  english: string;
  level: LevelId;
  category: CategoryId;
  rank: number;
  exZh: string;
  exPinyinNum: string;
  exPinyin: string;
  exZhuyin: string;
  exEn: string;
}

function parse(block: string, category: CategoryId): Omit<VocabEntry, "rank">[] {
  return block
    .trim()
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((line) => {
      const f = line.split("|").map((s) => s.trim());
      if (f.length !== 7) throw new Error(`Bad vocab line (${f.length} fields): ${line}`);
      const [hanzi, pinyinNum, english, level, exZh, exPinyinNum, exEn] = f;
      if (!LEVEL_IDS.includes(level as LevelId)) throw new Error(`Bad level in: ${line}`);
      return {
        hanzi,
        pinyinNum,
        pinyin: toToneMarks(pinyinNum),
        zhuyin: toZhuyin(pinyinNum),
        english,
        level: level as LevelId,
        category,
        exZh,
        exPinyinNum,
        exPinyin: toToneMarks(exPinyinNum),
        exZhuyin: toZhuyin(exPinyinNum),
        exEn,
      };
    });
}

/**
 * All 300 words. Rank orders new-card introduction within a level: themed
 * words are interleaved with core words so a beginner sees MRT/food/campus
 * vocabulary early instead of only after finishing the core list.
 */
export function buildVocab(): VocabEntry[] {
  const lists = [
    parse(CORE, "core"),
    parse(CAMPUS, "campus"),
    parse(FOOD, "food"),
    parse(MRT, "mrt"),
    parse(TECH, "tech"),
  ];
  const out: VocabEntry[] = [];
  const longest = Math.max(...lists.map((l) => l.length));
  // round-robin: 2 core words, then one from each themed list
  let rank = 1;
  const cursors = lists.map(() => 0);
  for (let round = 0; round < longest * 2; round++) {
    for (let li = 0; li < lists.length; li++) {
      const take = li === 0 ? 2 : 1;
      for (let k = 0; k < take; k++) {
        const item = lists[li][cursors[li]];
        if (item) {
          out.push({ ...item, rank: rank++ });
          cursors[li]++;
        }
      }
    }
  }
  return out;
}
