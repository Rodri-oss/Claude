"use client";
import type { Word } from "@prisma/client";
import { Reading } from "./Reading";
import { ContourButton, SpeakButton } from "./SpeakButton";
import { CATEGORIES, LEVELS } from "@/data/vocab";

export function LevelBadge({ level }: { level: string }) {
  const l = LEVELS.find((x) => x.id === level);
  return (
    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent" title={l ? `${l.band} · ${l.zh}` : level}>
      TOCFL {l?.name ?? level}
    </span>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  const c = CATEGORIES.find((x) => x.id === category);
  return (
    <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2">
      {c?.emoji} {c?.name ?? category}
    </span>
  );
}

/** Full word details: reading, meaning, example sentence with audio. */
export function WordDetails({ word }: { word: Word }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3">
        <Reading pinyin={word.pinyin} zhuyin={word.zhuyin} size="lg" className="text-center" />
      </div>
      <p className="text-center text-lg font-medium" data-testid="english">{word.english}</p>
      <div className="rounded-xl border border-line bg-paper p-3">
        <div className="flex items-start gap-3">
          <SpeakButton text={word.exZh} pinyinNum={word.exPinyinNum} size="sm" label="Play example" />
          <div className="min-w-0 flex-1 space-y-1">
            <p lang="zh-TW" className="han text-lg leading-snug">{word.exZh}</p>
            <Reading pinyin={word.exPinyin} zhuyin={word.exZhuyin} size="sm" />
            <p className="text-sm text-muted">{word.exEn}</p>
          </div>
        </div>
      </div>
      <div className="flex justify-center gap-2">
        <SpeakButton text={word.hanzi} pinyinNum={word.pinyinNum} slow size="sm" label="Play slowly" />
        <ContourButton pinyinNum={word.pinyinNum} />
      </div>
    </div>
  );
}
