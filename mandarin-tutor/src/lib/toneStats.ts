import type { Tone } from "./pinyin";

export const ALL_TONES: Tone[] = [1, 2, 3, 4, 5];

export interface ToneStat {
  tone: Tone;
  attempts: number;
  correct: number;
  /** raw accuracy 0–1, or null if no attempts */
  accuracy: number | null;
  /** smoothed accuracy used for ranking (Laplace: (c+1)/(n+2)) */
  score: number;
}

export interface AttemptLike {
  expectedTone: number;
  answeredTone: number;
  correct: boolean;
}

export function toneStats(attempts: AttemptLike[]): ToneStat[] {
  return ALL_TONES.map((tone) => {
    const mine = attempts.filter((a) => a.expectedTone === tone);
    const correct = mine.filter((a) => a.correct).length;
    return {
      tone,
      attempts: mine.length,
      correct,
      accuracy: mine.length ? correct / mine.length : null,
      score: (correct + 1) / (mine.length + 2),
    };
  });
}

/**
 * The tone to re-drill: lowest smoothed accuracy among tones with at least
 * `minAttempts` answers. Returns null until there is enough data.
 */
export function weakestTone(stats: ToneStat[], minAttempts = 5): Tone | null {
  const eligible = stats.filter((s) => s.attempts >= minAttempts);
  if (!eligible.length) return null;
  eligible.sort((a, b) => a.score - b.score || b.attempts - a.attempts);
  // only call it "weak" if it's actually below 90%
  return eligible[0].score < 0.9 ? eligible[0].tone : null;
}

/** confusion[expected][answered] = count */
export function confusion(attempts: AttemptLike[]): Record<number, Record<number, number>> {
  const m: Record<number, Record<number, number>> = {};
  for (const t of ALL_TONES) m[t] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const a of attempts) if (m[a.expectedTone]) m[a.expectedTone][a.answeredTone] = (m[a.expectedTone][a.answeredTone] ?? 0) + 1;
  return m;
}

/** Most common wrong answer for a tone, e.g. "3rd heard as 2nd". */
export function topConfusion(attempts: AttemptLike[], tone: Tone): Tone | null {
  const row = confusion(attempts)[tone];
  let best: Tone | null = null;
  let n = 0;
  for (const t of ALL_TONES) {
    if (t !== tone && row[t] > n) {
      n = row[t];
      best = t;
    }
  }
  return best;
}

/**
 * Pick which tone the next drill item should test. With a focus tone, 60% of
 * items target it and the rest are spread evenly (so the drill can't be
 * gamed by always pressing the same button).
 */
export function pickTone(focus: Tone | null, rand: () => number = Math.random): Tone {
  if (focus && rand() < 0.6) return focus;
  return ALL_TONES[Math.floor(rand() * ALL_TONES.length)];
}
