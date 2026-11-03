/**
 * Pinyin utilities.
 *
 * Source data is written in "numbered pinyin" — each syllable carries a tone
 * digit (1–4, 5 = neutral), e.g. "xue2sheng1" or "Wo3 shi4 xue2sheng1.".
 * From that single source we derive tone-marked pinyin and Zhuyin (bopomofo),
 * so the three never disagree.
 */

export type Tone = 1 | 2 | 3 | 4 | 5;

export interface Syllable {
  /** lower-case base syllable without tone, ü written as "ü" (e.g. "lü") */
  base: string;
  tone: Tone;
  /** true if the source syllable started with a capital letter */
  capital: boolean;
}

export type Token =
  | { kind: "syllable"; syllable: Syllable; wordStart: boolean }
  | { kind: "sep"; text: string };

const SYLLABLE_RE = /([A-Za-züÜv:]+?)([1-5])/g;

function normalizeBase(raw: string): string {
  return raw.toLowerCase().replace(/u:/g, "ü").replace(/v/g, "ü");
}

/** Split numbered pinyin into syllables and separators (spaces, punctuation). */
export function tokenize(numbered: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  let prevWasSyllable = false;
  for (const m of numbered.matchAll(SYLLABLE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) {
      const between = numbered.slice(last, idx);
      if (/[A-Za-z]/.test(between)) {
        throw new Error(`Unparseable pinyin near "${between}" in "${numbered}"`);
      }
      tokens.push({ kind: "sep", text: between });
      prevWasSyllable = false;
    }
    const raw = m[1];
    const base = normalizeBase(raw);
    if (!isValidSyllable(base)) {
      throw new Error(`Invalid pinyin syllable "${raw}${m[2]}" in "${numbered}"`);
    }
    tokens.push({
      kind: "syllable",
      syllable: { base, tone: Number(m[2]) as Tone, capital: /^[A-Z]/.test(raw) },
      wordStart: !prevWasSyllable,
    });
    prevWasSyllable = true;
    last = idx + m[0].length;
  }
  if (last < numbered.length) {
    const rest = numbered.slice(last);
    if (/[A-Za-z]/.test(rest)) {
      throw new Error(`Unparseable pinyin near "${rest}" in "${numbered}"`);
    }
    tokens.push({ kind: "sep", text: rest });
  }
  return tokens;
}

export function syllables(numbered: string): Syllable[] {
  return tokenize(numbered)
    .filter((t): t is Extract<Token, { kind: "syllable" }> => t.kind === "syllable")
    .map((t) => t.syllable);
}

export function tonesOf(numbered: string): Tone[] {
  return syllables(numbered).map((s) => s.tone);
}

const MARKS: Record<string, string[]> = {
  a: ["ā", "á", "ǎ", "à"],
  e: ["ē", "é", "ě", "è"],
  i: ["ī", "í", "ǐ", "ì"],
  o: ["ō", "ó", "ǒ", "ò"],
  u: ["ū", "ú", "ǔ", "ù"],
  ü: ["ǖ", "ǘ", "ǚ", "ǜ"],
};

/** Apply a tone mark to one base syllable using the standard placement rules. */
export function markSyllable(base: string, tone: Tone): string {
  if (tone === 5) return base;
  let pos = -1;
  if (base.includes("a")) pos = base.indexOf("a");
  else if (base.includes("e")) pos = base.indexOf("e");
  else if (base.includes("ou")) pos = base.indexOf("o");
  else {
    for (let i = base.length - 1; i >= 0; i--) {
      if ("iouü".includes(base[i])) {
        pos = i;
        break;
      }
    }
  }
  if (pos < 0) return base;
  const v = base[pos];
  return base.slice(0, pos) + MARKS[v][tone - 1] + base.slice(pos + 1);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "xue2sheng1" → "xuéshēng", "zao3an1" → "zǎo'ān" */
export function toToneMarks(numbered: string): string {
  let out = "";
  for (const t of tokenize(numbered)) {
    if (t.kind === "sep") {
      out += t.text;
      continue;
    }
    let s = markSyllable(t.syllable.base, t.syllable.tone);
    if (!t.wordStart && /^[aeoāáǎàēéěèōóǒò]/.test(s)) s = "'" + s;
    if (t.syllable.capital) s = capitalize(s);
    out += s;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Zhuyin (bopomofo)
// ---------------------------------------------------------------------------

const INITIALS: [string, string][] = [
  ["zh", "ㄓ"], ["ch", "ㄔ"], ["sh", "ㄕ"],
  ["b", "ㄅ"], ["p", "ㄆ"], ["m", "ㄇ"], ["f", "ㄈ"],
  ["d", "ㄉ"], ["t", "ㄊ"], ["n", "ㄋ"], ["l", "ㄌ"],
  ["g", "ㄍ"], ["k", "ㄎ"], ["h", "ㄏ"],
  ["j", "ㄐ"], ["q", "ㄑ"], ["x", "ㄒ"],
  ["r", "ㄖ"], ["z", "ㄗ"], ["c", "ㄘ"], ["s", "ㄙ"],
];

const FINALS: Record<string, string> = {
  a: "ㄚ", o: "ㄛ", e: "ㄜ", ê: "ㄝ", ai: "ㄞ", ei: "ㄟ", ao: "ㄠ", ou: "ㄡ",
  an: "ㄢ", en: "ㄣ", ang: "ㄤ", eng: "ㄥ", ong: "ㄨㄥ", er: "ㄦ",
  i: "ㄧ", ia: "ㄧㄚ", ie: "ㄧㄝ", iao: "ㄧㄠ", iu: "ㄧㄡ", ian: "ㄧㄢ",
  in: "ㄧㄣ", iang: "ㄧㄤ", ing: "ㄧㄥ", iong: "ㄩㄥ",
  u: "ㄨ", ua: "ㄨㄚ", uo: "ㄨㄛ", uai: "ㄨㄞ", ui: "ㄨㄟ", uan: "ㄨㄢ",
  un: "ㄨㄣ", uang: "ㄨㄤ",
  ü: "ㄩ", üe: "ㄩㄝ", üan: "ㄩㄢ", ün: "ㄩㄣ",
};

const STANDALONE: Record<string, string> = {
  // y- syllables
  yi: "ㄧ", ya: "ㄧㄚ", yo: "ㄧㄛ", ye: "ㄧㄝ", yai: "ㄧㄞ", yao: "ㄧㄠ", you: "ㄧㄡ",
  yan: "ㄧㄢ", yin: "ㄧㄣ", yang: "ㄧㄤ", ying: "ㄧㄥ", yong: "ㄩㄥ",
  yu: "ㄩ", yue: "ㄩㄝ", yuan: "ㄩㄢ", yun: "ㄩㄣ",
  // w- syllables
  wu: "ㄨ", wa: "ㄨㄚ", wo: "ㄨㄛ", wai: "ㄨㄞ", wei: "ㄨㄟ", wan: "ㄨㄢ",
  wen: "ㄨㄣ", wang: "ㄨㄤ", weng: "ㄨㄥ",
  // zero-initial
  a: "ㄚ", o: "ㄛ", e: "ㄜ", ai: "ㄞ", ei: "ㄟ", ao: "ㄠ", ou: "ㄡ",
  an: "ㄢ", en: "ㄣ", ang: "ㄤ", eng: "ㄥ", er: "ㄦ",
};

const APICALS = new Set(["zh", "ch", "sh", "r", "z", "c", "s"]);

function splitInitial(base: string): [string, string] {
  for (const [p] of INITIALS) {
    if (base.startsWith(p)) return [p, base.slice(p.length)];
  }
  return ["", base];
}

/** Convert one base syllable (no tone) to Zhuyin letters, or null if invalid. */
export function zhuyinBase(base: string): string | null {
  if (STANDALONE[base]) return STANDALONE[base];
  const [ini, fin] = splitInitial(base);
  if (!ini) return null;
  const iniZ = INITIALS.find(([p]) => p === ini)![1];
  // zhi, chi, shi, ri, zi, ci, si: the "i" is not written in Zhuyin
  if (fin === "i" && APICALS.has(ini)) return iniZ;
  let f = fin;
  // j/q/x + u... is really ü
  if ("jqx".includes(ini) && f.startsWith("u")) f = "ü" + f.slice(1);
  // b/p/m/f + o is ㄛ (bo = ㄅㄛ)
  const finZ = FINALS[f];
  if (!finZ) return null;
  // apicals only take finals that don't start with i/ü
  if (APICALS.has(ini) && /^[iü]/.test(f)) return null;
  if ("jqx".includes(ini) && !/^[iü]/.test(f)) return null;
  if (/^ü/.test(f) && !"nljqx".includes(ini)) return null;
  if ("gkhf".includes(ini) && /^i/.test(f)) return null;
  return iniZ + finZ;
}

export function isValidSyllable(base: string): boolean {
  return zhuyinBase(base) !== null;
}

const ZHUYIN_TONE = ["", "ˊ", "ˇ", "ˋ"];

export function zhuyinSyllable(base: string, tone: Tone): string {
  const z = zhuyinBase(base);
  if (!z) throw new Error(`No Zhuyin for "${base}"`);
  if (tone === 5) return "˙" + z;
  return z + ZHUYIN_TONE[tone - 1];
}

/**
 * Numbered pinyin → Zhuyin. Syllables are space-separated (Zhuyin is written
 * per character); punctuation is converted to full-width forms.
 */
export function toZhuyin(numbered: string): string {
  const parts: string[] = [];
  for (const t of tokenize(numbered)) {
    if (t.kind === "syllable") {
      parts.push(zhuyinSyllable(t.syllable.base, t.syllable.tone));
    } else {
      const p = t.text
        .trim()
        .replace(/,/g, "，")
        .replace(/\?/g, "？")
        .replace(/!/g, "！")
        .replace(/\./g, "。")
        .replace(/;/g, "；")
        .replace(/:/g, "：");
      if (p) parts.push(p);
    }
  }
  // attach punctuation to the preceding syllable
  return parts.join(" ").replace(/ ([，？！。；：])/g, "$1");
}

/** Count Han characters in a string (ignores punctuation, Latin, spaces). */
export function countHan(text: string): number {
  return (text.match(/\p{Script=Han}/gu) ?? []).length;
}

export const TONE_NAMES: Record<Tone, string> = {
  1: "1st (high level)",
  2: "2nd (rising)",
  3: "3rd (dipping)",
  4: "4th (falling)",
  5: "Neutral",
};

export const TONE_SHORT: Record<Tone, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd",
  4: "4th",
  5: "neutral",
};

/** Chao tone letters used for the synthesized pitch contour. */
export const CHAO: Record<Tone, number[]> = {
  1: [5, 5],
  2: [3, 5],
  3: [2, 1, 4],
  4: [5, 1],
  5: [3, 3], // overridden by context, see contourFor()
};

/**
 * Pitch targets for a sequence of tones, with the common sandhi rules a
 * listener actually hears:
 *  - 3 + 3 → 2 + 3
 *  - a 3rd tone not at the end of a phrase is a "half third" (21)
 *  - neutral tone pitch depends on the preceding tone
 */
export function contourFor(tones: Tone[]): number[][] {
  const surface = [...tones];
  for (let i = surface.length - 2; i >= 0; i--) {
    if (surface[i] === 3 && surface[i + 1] === 3) surface[i] = 2;
  }
  return surface.map((t, i) => {
    if (t === 5) {
      const prev = i > 0 ? surface[i - 1] : 1;
      return prev === 1 ? [2, 2] : prev === 2 ? [3, 3] : prev === 3 ? [4, 4] : [1, 1];
    }
    if (t === 3 && i < surface.length - 1) return [2, 1];
    return CHAO[t];
  });
}
