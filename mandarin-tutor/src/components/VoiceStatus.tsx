"use client";
import { useEffect, useState } from "react";
import { pickVoice, speechSupported, type VoiceKind } from "@/lib/audio/speech";

/** Warns when there is no Taiwan Mandarin voice, explaining the fallback. */
export function VoiceStatus({ compact = false }: { compact?: boolean }) {
  const [state, setState] = useState<{ kind: VoiceKind; name?: string } | null>(null);
  useEffect(() => {
    if (!speechSupported()) {
      setState({ kind: "none" });
      return;
    }
    void pickVoice().then(({ voice, kind }) => setState({ kind, name: voice?.name }));
  }, []);
  if (!state) return null;
  if (state.kind === "zh-TW") {
    return compact ? null : (
      <p className="rounded-xl bg-jade-soft px-3 py-2 text-sm text-jade" data-testid="voice-status">
        ✓ Taiwan Mandarin voice: {state.name}
      </p>
    );
  }
  return (
    <div className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-ink-2" data-testid="voice-status">
      {state.kind === "zh-other" ? (
        <>
          Using <b>{state.name}</b>, which isn&apos;t a Taiwan voice. Install a zh-TW voice for Taiwan pronunciation
          (see Settings).
        </>
      ) : (
        <>
          No Chinese voice found on this device, so audio plays <b>synthesized tone contours</b> instead of speech.
          {!compact && " Install a Chinese (Taiwan) voice in your OS speech settings for real pronunciation."}
        </>
      )}
    </div>
  );
}
