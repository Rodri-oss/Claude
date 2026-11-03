"use client";
import { usePrefs } from "./Prefs";

/** Pinyin and/or Zhuyin lines, according to the learner's toggles. */
export function Reading({ pinyin, zhuyin, className = "", size = "md" }: { pinyin: string; zhuyin: string; className?: string; size?: "sm" | "md" | "lg" }) {
  const { prefs } = usePrefs();
  const text = size === "lg" ? "text-xl" : size === "sm" ? "text-sm" : "text-base";
  if (!prefs.showPinyin && !prefs.showZhuyin) return null;
  return (
    <div className={`space-y-0.5 ${className}`}>
      {prefs.showPinyin && <div className={`${text} text-ink-2`} data-testid="pinyin">{pinyin}</div>}
      {prefs.showZhuyin && (
        <div lang="zh-TW" className={`zhuyin ${text} text-ink-2`} data-testid="zhuyin">
          {zhuyin}
        </div>
      )}
    </div>
  );
}

export function PhoneticToggles() {
  const { prefs, setPrefs } = usePrefs();
  const chip = (on: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs font-medium transition ${
      on ? "border-accent bg-accent text-accent-ink" : "border-line bg-card text-ink-2"
    }`;
  return (
    <div className="flex gap-1.5" role="group" aria-label="Phonetic display">
      <button className={chip(prefs.showPinyin)} aria-pressed={prefs.showPinyin} onClick={() => setPrefs({ showPinyin: !prefs.showPinyin })}>
        Pinyin
      </button>
      <button className={`${chip(prefs.showZhuyin)} zhuyin`} aria-pressed={prefs.showZhuyin} onClick={() => setPrefs({ showZhuyin: !prefs.showZhuyin })} title="Zhuyin (bopomofo)">
        ㄅㄆㄇ
      </button>
    </div>
  );
}
