"use client";
import { useState } from "react";
import type { ToneStat } from "@/lib/toneStats";
import type { Tone } from "@/lib/pinyin";

/** Shared state for tone drills: posting attempts and keeping stats fresh. */
export function useToneDrill(initialStats: ToneStat[], initialWeakest: Tone | null) {
  const [stats, setStats] = useState(initialStats);
  const [weakest, setWeakest] = useState(initialWeakest);
  const [score, setScore] = useState({ right: 0, total: 0 });

  async function record(exercise: "tone-id" | "minimal-pair", prompt: string, expectedTone: Tone, answeredTone: Tone) {
    setScore((s) => ({ right: s.right + (expectedTone === answeredTone ? 1 : 0), total: s.total + 1 }));
    const res = await fetch("/api/tones/attempt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ exercise, prompt, expectedTone, answeredTone }),
    });
    if (res.ok) {
      const data = await res.json();
      setStats(data.stats);
      setWeakest(data.weakest);
    }
  }
  return { stats, weakest, score, record };
}
