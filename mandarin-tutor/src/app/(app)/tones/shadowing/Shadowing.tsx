"use client";
import { useRef, useState } from "react";
import type { Word } from "@prisma/client";
import { speak } from "@/lib/audio/speech";
import { playBlob, recordingSupported, startRecording, type ActiveRecording } from "@/lib/audio/recorder";
import { pitchFromBlob, type PitchPoint } from "@/lib/audio/pitch";
import { tonesOf } from "@/lib/pinyin";
import { Reading } from "@/components/Reading";
import { PitchCompare } from "@/components/PitchCompare";

const RATINGS = [
  { v: 1, label: "Needs work", cls: "bg-[var(--t1)]" },
  { v: 2, label: "Getting there", cls: "bg-[var(--t2)]" },
  { v: 3, label: "Good", cls: "bg-[var(--t3)]" },
  { v: 4, label: "Nailed it", cls: "bg-[var(--t4)]" },
];

export function Shadowing({ sentences }: { sentences: Word[] }) {
  const [i, setI] = useState(0);
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [pitch, setPitch] = useState<PitchPoint[] | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [showText, setShowText] = useState(true);
  const rec = useRef<ActiveRecording | null>(null);


  const s = sentences[i % sentences.length];
  const tones = tonesOf(s.exPinyinNum);

  const playModel = (slow = false) => speak(s.exZh, { pinyinNum: s.exPinyinNum, rate: slow ? 0.6 : undefined });

  async function toggleRecord() {
    setMicError(null);
    if (!recordingSupported()) {
      setMicError("Recording isn't supported in this browser. Shadow out loud, then rate yourself.");
      return;
    }
    if (recording && rec.current) {
      const b = await rec.current.stop();
      rec.current = null;
      setRecording(false);
      setBlob(b);
      try {
        setPitch(await pitchFromBlob(b));
      } catch {
        setPitch([]);
      }
      return;
    }
    try {
      rec.current = await startRecording();
      setRecording(true);
      setBlob(null);
      setPitch(null);
    } catch {
      setMicError("Microphone unavailable. Allow mic access in your browser, or shadow out loud and self-rate.");
    }
  }

  async function rate(v: number) {
    await fetch("/api/shadow/attempt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wordId: s.id, rating: v }) });
    setCount((c) => c + 1);
    setI((x) => x + 1);
    setBlob(null);
    setPitch(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Shadowing</h1>
        <span className="text-sm text-muted" data-testid="shadow-count">{count} done</span>
      </div>
      <ol className="flex gap-2 text-xs text-muted">
        <li>1 Listen</li><li>→ 2 Record</li><li>→ 3 Compare</li><li>→ 4 Rate</li>
      </ol>

      <article className="space-y-3 rounded-2xl border border-line bg-card p-5 shadow-sm" data-testid="shadow-sentence">
        {showText ? (
          <>
            <p lang="zh-TW" className="han text-3xl leading-snug">{s.exZh}</p>
            <Reading pinyin={s.exPinyin} zhuyin={s.exZhuyin} />
            <p className="text-sm text-muted">{s.exEn}</p>
          </>
        ) : (
          <p className="py-6 text-center text-sm text-muted">Text hidden — shadow by ear.</p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={() => void playModel()} className="rounded-xl bg-accent px-4 py-2 font-medium text-accent-ink">🔊 Listen</button>
          <button onClick={() => void playModel(true)} className="rounded-xl border border-line px-3 py-2">🐢 Slow</button>
          <button onClick={() => setShowText((v) => !v)} className="ml-auto rounded-xl border border-line px-3 py-2 text-sm">{showText ? "Hide text" : "Show text"}</button>
        </div>
      </article>

      <section className="space-y-3 rounded-2xl border border-line bg-card p-5">
        <button
            onClick={() => void toggleRecord()}
            className={`w-full rounded-xl py-3.5 font-semibold ${recording ? "animate-pulse bg-[var(--t1)] text-white" : "bg-ink text-paper"}`}
          >
            {recording ? "■ Stop recording" : blob ? "🎙️ Record again" : "🎙️ Record yourself"}
          </button>
        {micError && <p className="text-sm text-[var(--t1)]">{micError}</p>}
        {blob && (
          <div className="space-y-3" data-testid="compare">
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => void playModel()} className="rounded-xl border border-line py-2 text-sm">🔊 Model</button>
              <button onClick={() => void playBlob(blob)} className="rounded-xl border border-line py-2 text-sm">🎧 Mine</button>
              <button
                onClick={async () => {
                  await playModel();
                  await playBlob(blob);
                }}
                className="rounded-xl border border-line py-2 text-sm"
              >
                ⏯ Both
              </button>
            </div>
            {pitch && <PitchCompare points={pitch} tones={tones} />}
          </div>
        )}
      </section>

      <section>
        <p className="mb-2 text-sm font-semibold">How close was your version?</p>
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Self-rating">
          {RATINGS.map((r) => (
            <button key={r.v} onClick={() => void rate(r.v)} className={`rounded-xl py-3 text-sm font-semibold text-white ${r.cls}`}>
              {r.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
