"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { PAIR_SETS, type PairSet } from "@/data/tones";
import type { ToneStat } from "@/lib/toneStats";
import { syllables, toToneMarks, toZhuyin, TONE_SHORT, type Tone } from "@/lib/pinyin";
import { speak } from "@/lib/audio/speech";
import { Reading } from "@/components/Reading";
import { ToneAccuracy } from "@/components/ToneAccuracy";
import { useToneDrill } from "@/components/useToneDrill";

const ROUND = 15;

interface Question {
  set: PairSet;
  target: number;
}

const toneAt = (set: PairSet, i: number) => syllables(set.options[i].pinyinNum)[set.diffSyllable].tone as Tone;

function nextQuestion(focus: Tone | null, prev?: Question): Question {
  for (;;) {
    let pool = PAIR_SETS;
    // with a focus tone, 60% of questions use a set where the answer has that tone
    const useFocus = focus && Math.random() < 0.6;
    if (useFocus) pool = PAIR_SETS.filter((s) => s.options.some((_, i) => toneAt(s, i) === focus));
    const set = pool[Math.floor(Math.random() * pool.length)];
    let target = Math.floor(Math.random() * set.options.length);
    if (useFocus) target = set.options.findIndex((_, i) => toneAt(set, i) === focus);
    if (!prev || prev.set.id !== set.id) return { set, target };
  }
}

export function MinimalPairs({ initialStats, weakest: w0, focus }: { initialStats: ToneStat[]; weakest: Tone | null; focus: Tone | null }) {
  const { stats, weakest, score, record } = useToneDrill(initialStats, w0);
  const [q, setQ] = useState<Question | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [showResults, setShowResults] = useState(false);


  const playOption = useCallback((qq: Question | null, i: number) => {
    if (!qq) return;
    const o = qq.set.options[i];
    return speak(o.text, { pinyinNum: o.pinyinNum });
  }, []);

  const pick = (i: number) => {
    if (!q || picked !== null) return;
    setPicked(i);
    void record("minimal-pair", q.set.options[q.target].pinyinNum, toneAt(q.set, q.target), toneAt(q.set, i));
  };

  const next = () => {
    if (score.total >= ROUND) return setShowResults(true);
    const nq = nextQuestion(focus, q ?? undefined);
    setQ(nq);
    setPicked(null);
    void playOption(nq, nq.target);
  };

  if (showResults) {
    return (
      <div className="space-y-5 text-center">
        <h1 className="text-2xl font-bold">Round complete</h1>
        <p className="text-4xl font-bold" data-testid="round-score">{score.right} / {score.total}</p>
        <div className="rounded-2xl border border-line bg-card p-4 text-left"><ToneAccuracy stats={stats} weakest={weakest} /></div>
        <div className="flex justify-center gap-2">
          {weakest && <a href={`/tones/pairs?focus=${weakest}`} className="rounded-xl bg-accent px-4 py-2 font-medium text-accent-ink">Focus on {TONE_SHORT[weakest]} tone</a>}
          <a href="/tones/pairs" className="rounded-xl border border-line px-4 py-2 font-medium">Another round</a>
        </div>
        <Link href="/tones" className="text-sm text-muted underline">Back to tones</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Minimal pairs</h1>
        <span className="text-sm text-muted tabular-nums" data-testid="progress">{score.right}/{score.total} · of {ROUND}</span>
      </div>
      {focus && <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm">Focus: <b>{TONE_SHORT[focus]} tone</b></p>}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-card p-6 shadow-sm">
        {!started ? (
          <button
            className="rounded-full bg-accent px-6 py-3 text-lg font-semibold text-accent-ink"
            onClick={() => {
              const nq = nextQuestion(focus);
              setQ(nq);
              setStarted(true);
              void playOption(nq, nq.target);
            }}
          >
            ▶ Start listening
          </button>
        ) : (
          <>
            <button onClick={() => q && void playOption(q, q.target)} aria-label="Play again" className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-3xl text-accent-ink shadow active:scale-95">
              🔊
            </button>
            <p className="text-sm text-ink-2">Which one did you hear?</p>
          </>
        )}
      </div>
      {started && q && (
        <div className={`grid gap-2 ${q.set.options.length === 4 ? "grid-cols-2" : "grid-cols-2"}`} role="group" aria-label="Options">
          {q.set.options.map((o, i) => {
            const right = picked !== null && i === q.target;
            const wrong = picked === i && i !== q.target;
            return (
              <div key={o.text} className={`rounded-xl border-2 bg-card ${right ? "border-jade bg-jade-soft" : wrong ? "border-[var(--t1)]" : "border-line"}`}>
                <button disabled={picked !== null} onClick={() => pick(i)} className="w-full p-3 text-center" data-testid="pair-option">
                  <span lang="zh-TW" className="han block text-3xl">{o.text}</span>
                  <Reading pinyin={toToneMarks(o.pinyinNum)} zhuyin={toZhuyin(o.pinyinNum)} size="sm" className="text-center" />
                  <span className="block text-xs text-muted">{o.english}</span>
                </button>
                {picked !== null && (
                  <button onClick={() => void playOption(q, i)} className="w-full border-t border-line py-1.5 text-xs text-ink-2">🔊 compare</button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {picked !== null && q && (
        <>
          <p className={`text-center font-semibold ${picked === q.target ? "text-jade" : "text-[var(--t1)]"}`} data-testid="feedback">
            {picked === q.target ? "✓ Correct!" : `✗ It was ${q.set.options[q.target].text} (${toToneMarks(q.set.options[q.target].pinyinNum)})`}
          </p>
          <button onClick={next} className="w-full rounded-xl bg-ink py-3.5 font-semibold text-paper">
            {score.total >= ROUND ? "See results" : "Next →"}
          </button>
        </>
      )}
    </div>
  );
}
