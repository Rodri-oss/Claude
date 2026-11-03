"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Word } from "@prisma/client";
import { previewIntervals, RATING_LABELS, type Rating } from "@/lib/srs";
import { speak } from "@/lib/audio/speech";
import { SpeakButton } from "@/components/SpeakButton";
import { CategoryBadge, LevelBadge, WordDetails } from "@/components/WordCard";

interface QueueCard {
  wordId: number;
  isNew: boolean;
  word: Word;
  previews: Record<Rating, string>;
}

const BTN: Record<Rating, string> = {
  1: "bg-[var(--t1)] text-white",
  2: "bg-[var(--t2)] text-white",
  3: "bg-[var(--t3)] text-white",
  4: "bg-[var(--t4)] text-white",
};

export function ReviewSession({ initial, newPerDay, introducedToday }: { initial: QueueCard[]; newPerDay: number; introducedToday: number }) {
  const [queue, setQueue] = useState(initial);
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const card = queue[pos];
  const remaining = queue.slice(pos);
  const counts = useMemo(
    () => ({ new: remaining.filter((c) => c.isNew).length, due: remaining.filter((c) => !c.isNew).length }),
    [remaining],
  );
  const showBack = revealed || card?.isNew;

  const reveal = useCallback(() => {
    if (!card) return;
    setRevealed(true);
    void speak(card.word.hanzi, { pinyinNum: card.word.pinyinNum });
  }, [card]);

  const answer = useCallback(
    async (rating: Rating) => {
      if (!card || saving) return;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/review/answer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ wordId: card.wordId, rating }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
        const st = await res.json();
        setDone((d) => d + 1);
        if (rating === 1) {
          // show it again later in this session
          const again: QueueCard = { ...card, isNew: false, previews: previewIntervals({ ease: st.ease, intervalDays: st.intervalDays, reps: st.reps, lapses: 0 }) };
          setQueue((q) => {
            const next = [...q];
            next.splice(Math.min(pos + 4, next.length), 0, again);
            return next;
          });
        }
        setPos((p) => p + 1);
        setRevealed(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [card, pos, saving],
  );

  // keyboard: space = show, 1–4 = rate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === " " && !showBack) {
        e.preventDefault();
        reveal();
      } else if (showBack && ["1", "2", "3", "4"].includes(e.key)) {
        void answer(Number(e.key) as Rating);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showBack, reveal, answer]);

  if (!card) {
    return (
      <div className="space-y-4 py-10 text-center" data-testid="review-done">
        <p className="text-5xl">🎉</p>
        <h1 className="text-xl font-bold">{done ? `Done! ${done} card${done === 1 ? "" : "s"} reviewed.` : "Nothing to review right now."}</h1>
        <p className="text-ink-2">
          {introducedToday + initial.filter((c) => c.isNew).length >= newPerDay
            ? `You've reached today's limit of ${newPerDay} new cards. Come back tomorrow for more.`
            : "Check back later for cards that come due."}
        </p>
        <div className="flex justify-center gap-2">
          <Link href="/tones/identify" className="rounded-xl bg-accent px-4 py-2 font-medium text-accent-ink">Practice tones</Link>
          <Link href="/dashboard" className="rounded-xl border border-line px-4 py-2 font-medium">Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm" data-testid="review-counts">
        <div className="flex gap-3">
          <span><b className="text-t4">{counts.new}</b> new</span>
          <span><b className="text-t3">{counts.due}</b> due</span>
        </div>
        <span className="text-muted">{done} done</span>
      </div>

      <article className="rounded-2xl border border-line bg-card p-5 shadow-sm" data-testid="review-card">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {card.isNew && <span className="rounded-full bg-t4 px-2 py-0.5 text-[11px] font-semibold text-white">NEW</span>}
          <LevelBadge level={card.word.level} />
          <CategoryBadge category={card.word.category} />
        </div>
        <div className="flex items-center justify-center gap-4 py-4">
          <p lang="zh-TW" className="han text-6xl font-medium" data-testid="hanzi">{card.word.hanzi}</p>
          <SpeakButton text={card.word.hanzi} pinyinNum={card.word.pinyinNum} />
        </div>
        {showBack ? (
          <WordDetails word={card.word} />
        ) : (
          <p className="text-center text-sm text-muted">Recall the reading and meaning, then reveal.</p>
        )}
      </article>

      {error && <p className="text-sm text-[var(--t1)]">{error}</p>}

      {showBack ? (
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="How well did you know it?">
          {([1, 2, 3, 4] as Rating[]).map((r) => (
            <button
              key={r}
              disabled={saving}
              onClick={() => void answer(r)}
              className={`flex flex-col items-center rounded-xl py-3 font-semibold shadow-sm transition active:scale-95 disabled:opacity-60 ${BTN[r]}`}
            >
              {RATING_LABELS[r]}
              <span className="text-[11px] font-normal opacity-90">{card.previews[r]}</span>
            </button>
          ))}
        </div>
      ) : (
        <button onClick={reveal} className="w-full rounded-xl bg-ink py-3.5 font-semibold text-paper shadow-sm active:scale-[0.99]">
          Show answer
        </button>
      )}
      <p className="hidden text-center text-xs text-muted sm:block">Keyboard: space to reveal · 1–4 to rate</p>
    </div>
  );
}
