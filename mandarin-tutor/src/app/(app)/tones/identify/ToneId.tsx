"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TONE_ITEMS, type ToneItem } from "@/data/tones";
import { pickTone, type ToneStat } from "@/lib/toneStats";
import { toToneMarks, toZhuyin, TONE_SHORT, type Tone } from "@/lib/pinyin";
import { speak } from "@/lib/audio/speech";
import { playContourFor } from "@/lib/audio/contour";
import { ToneShape } from "@/components/ToneShape";
import { ToneAccuracy } from "@/components/ToneAccuracy";
import { Reading } from "@/components/Reading";
import { useToneDrill } from "@/components/useToneDrill";

const ROUND = 20;
const MARK: Record<Tone, string> = { 1: "ˉ", 2: "ˊ", 3: "ˇ", 4: "ˋ", 5: "˙" };

function nextItem(focus: Tone | null, prev?: ToneItem): ToneItem {
  for (;;) {
    const tone = pickTone(focus);
    const pool = TONE_ITEMS.filter((i) => i.tone === tone && i.id !== prev?.id);
    const it = pool[Math.floor(Math.random() * pool.length)];
    if (it) return it;
  }
}

export function ToneId({ initialStats, weakest: initialWeakest, focus }: { initialStats: ToneStat[]; weakest: Tone | null; focus: Tone | null }) {
  const { stats, weakest, score, record } = useToneDrill(initialStats, initialWeakest);
  const [item, setItem] = useState<ToneItem | null>(null);
  const [answer, setAnswer] = useState<Tone | null>(null);
  const [started, setStarted] = useState(false);
  const [showResults, setShowResults] = useState(false);


  const play = useCallback(async (it: ToneItem | null = item) => {
    if (!it) return;
    await speak(it.text, { pinyinNum: it.pinyinNum });
  }, [item]);

  const choose = useCallback(
    (t: Tone) => {
      if (!item || answer) return;
      setAnswer(t);
      void record("tone-id", item.id, item.tone, t);
    },
    [item, answer, record],
  );

  const next = useCallback(() => {
    if (score.total >= ROUND) {
      setShowResults(true);
      return;
    }
    const it = nextItem(focus, item ?? undefined);
    setItem(it);
    setAnswer(null);
    void play(it);
  }, [focus, item, play, score.total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["1", "2", "3", "4", "5"].includes(e.key) && !answer) choose(Number(e.key) as Tone);
      else if (e.key === "Enter" && answer) next();
      else if (e.key === " ") {
        e.preventDefault();
        void play();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, choose, next, play]);

  const syllableLabel = useMemo(() => (item && item.target > 0 ? "the 2nd syllable" : "this syllable"), [item]);

  if (showResults) {
    return (
      <div className="space-y-5 text-center">
        <h1 className="text-2xl font-bold">Round complete</h1>
        <p className="text-4xl font-bold" data-testid="round-score">{score.right} / {score.total}</p>
        <div className="rounded-2xl border border-line bg-card p-4 text-left"><ToneAccuracy stats={stats} weakest={weakest} /></div>
        <div className="flex justify-center gap-2">
          {weakest && <a href={`/tones/identify?focus=${weakest}`} className="rounded-xl bg-accent px-4 py-2 font-medium text-accent-ink">Drill {TONE_SHORT[weakest]} tone</a>}
          <a href={focus ? `/tones/identify?focus=${focus}` : "/tones/identify"} className="rounded-xl border border-line px-4 py-2 font-medium">Another round</a>
        </div>
        <Link href="/tones" className="text-sm text-muted underline">Back to tones</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Tone ID</h1>
        <span className="text-sm text-muted tabular-nums" data-testid="progress">{score.right}/{score.total} · {Math.min(score.total + (answer ? 0 : 1), ROUND)} of {ROUND}</span>
      </div>
      {focus && (
        <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm" data-testid="focus-banner">
          Focus: <b>{TONE_SHORT[focus]} tone</b> — it comes up more often this round.
        </p>
      )}

      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-card p-6 shadow-sm">
        {!started ? (
          <button
            className="rounded-full bg-accent px-6 py-3 text-lg font-semibold text-accent-ink"
            onClick={() => {
              const it = nextItem(focus);
              setItem(it);
              setStarted(true);
              void play(it);
            }}
          >
            ▶ Start listening
          </button>
        ) : (
          <>
            <button onClick={() => void play()} aria-label="Play again" className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-3xl text-accent-ink shadow active:scale-95">
              🔊
            </button>
            <p className="text-sm text-ink-2">Which tone is {syllableLabel}?</p>
            {item && item.target > 0 && !answer && <p className="text-xs text-muted">(a 2-syllable word — listen to the end)</p>}
          </>
        )}
        {answer && item && (
          <div className="w-full space-y-2 text-center" data-testid="feedback">
            <p className={`text-lg font-bold ${answer === item.tone ? "text-jade" : "text-[var(--t1)]"}`}>
              {answer === item.tone ? "✓ Correct!" : `✗ That was the ${TONE_SHORT[item.tone]} tone`}
            </p>
            <p lang="zh-TW" className="han text-4xl">{item.text}</p>
            <Reading pinyin={toToneMarks(item.pinyinNum)} zhuyin={toZhuyin(item.pinyinNum)} className="text-center" />
            <div className="flex justify-center gap-2">
              <button className="rounded-lg border border-line px-3 py-1 text-sm" onClick={() => void play()}>🔊 Again</button>
              <button className="rounded-lg border border-line px-3 py-1 text-sm" onClick={() => void playContourFor(item.pinyinNum)}>〰️ Contour</button>
            </div>
          </div>
        )}
      </div>

      {started && (
        <div className="grid grid-cols-5 gap-2" role="group" aria-label="Choose the tone">
          {([1, 2, 3, 4, 5] as Tone[]).map((t) => {
            const isRight = answer && t === item?.tone;
            const isWrongPick = answer === t && t !== item?.tone;
            return (
              <button
                key={t}
                disabled={!!answer}
                onClick={() => choose(t)}
                aria-label={`${TONE_SHORT[t]} tone`}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 bg-card py-3 font-semibold transition active:scale-95 ${
                  isRight ? "border-jade bg-jade-soft" : isWrongPick ? "border-[var(--t1)]" : "border-line"
                }`}
              >
                <ToneShape tone={t} />
                <span className="text-sm">{t === 5 ? "neutral" : `${t} ${MARK[t]}`}</span>
              </button>
            );
          })}
        </div>
      )}

      {answer && (
        <button onClick={next} className="w-full rounded-xl bg-ink py-3.5 font-semibold text-paper">
          {score.total >= ROUND ? "See results" : "Next →"}
        </button>
      )}

      <details className="rounded-2xl border border-line bg-card p-4">
        <summary className="cursor-pointer text-sm font-semibold">Your accuracy by tone</summary>
        <div className="mt-3"><ToneAccuracy stats={stats} weakest={weakest} /></div>
      </details>
    </div>
  );
}
