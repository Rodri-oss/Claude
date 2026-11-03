"use client";
import { useState } from "react";
import { speak } from "@/lib/audio/speech";
import { playContourFor } from "@/lib/audio/contour";

export function SpeakButton({
  text,
  pinyinNum,
  label = "Play",
  slow = false,
  size = "md",
  className = "",
}: {
  text: string;
  pinyinNum?: string;
  label?: string;
  slow?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const dims = size === "lg" ? "h-14 w-14 text-2xl" : size === "sm" ? "h-8 w-8 text-sm" : "h-10 w-10 text-lg";
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await speak(text, { pinyinNum, rate: slow ? 0.6 : undefined });
        } finally {
          setBusy(false);
        }
      }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-sm transition active:scale-95 disabled:opacity-60 ${dims} ${className}`}
    >
      <span aria-hidden>{slow ? "🐢" : "🔊"}</span>
    </button>
  );
}

/** Plays the synthesized pitch contour (always available, no voice needed). */
export function ContourButton({ pinyinNum, className = "" }: { pinyinNum: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => void playContourFor(pinyinNum)}
      title="Hear the tone contour"
      aria-label="Play tone contour"
      className={`inline-flex h-8 items-center gap-1 rounded-full border border-line bg-card px-3 text-xs text-ink-2 active:scale-95 ${className}`}
    >
      <span aria-hidden>〰️</span> Contour
    </button>
  );
}
