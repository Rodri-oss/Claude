import type { Tone } from "../pinyin";

/** Parse ?focus=1..5 or ?focus=weakest into a tone. */
export function parseFocus(raw: string | string[] | undefined, weakest: Tone | null): Tone | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "weakest") return weakest;
  const n = Number(v);
  return n >= 1 && n <= 5 ? (n as Tone) : null;
}
