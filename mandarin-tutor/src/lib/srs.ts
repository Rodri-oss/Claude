/**
 * SM-2 spaced repetition with four answer buttons.
 *
 * Mapping of buttons to SM-2 quality (q):
 *   Again → fail   Hard → q=3   Good → q=4   Easy → q=5
 *
 * Ease factor (EF) follows the SM-2 formula
 *   EF' = EF + (0.1 − (5−q)(0.08 + (5−q)·0.02)),  floor 1.3
 * and intervals follow SM-2 (1 day, 6 days, then interval × EF), with the
 * usual four-button refinements: Hard grows the interval more slowly (×1.2)
 * and Easy adds a 1.3× bonus. "Again" restarts the repetition count, shows
 * the card again in 10 minutes, and lowers EF by 0.2 (instead of SM-2's
 * −0.54 for q=1, which tends to trap cards at the minimum ease).
 *
 * Review intervals ≥ 1 day land at local midnight of the due day, so a card
 * due "tomorrow" is available all of tomorrow, not just after the same hour.
 */
import { addDays, dayKey, startOfDay } from "./dates";

export type Rating = 1 | 2 | 3 | 4;
export const RATING_LABELS: Record<Rating, string> = { 1: "Again", 2: "Hard", 3: "Good", 4: "Easy" };

export interface SrsState {
  ease: number;
  intervalDays: number;
  reps: number;
  lapses: number;
}

export interface SrsResult extends SrsState {
  due: Date;
}

export const NEW_CARD: SrsState = { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0 };
export const MIN_EASE = 1.3;
export const RELEARN_MINUTES = 10;

const QUALITY: Record<Exclude<Rating, 1>, number> = { 2: 3, 3: 4, 4: 5 };

export function nextEase(ease: number, rating: Rating): number {
  if (rating === 1) return Math.max(MIN_EASE, round2(ease - 0.2));
  const q = QUALITY[rating];
  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  return Math.max(MIN_EASE, round2(ease + delta));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Interval in days after a successful answer (rating 2–4). */
export function nextInterval(state: SrsState, rating: Exclude<Rating, 1>, newEase: number): number {
  const reps = state.reps + 1;
  if (reps === 1) return rating === 4 ? 4 : 1;
  if (reps === 2) return rating === 2 ? 3 : rating === 3 ? 6 : 8;
  const prev = Math.max(1, state.intervalDays);
  let next: number;
  if (rating === 2) next = prev * 1.2;
  else if (rating === 3) next = prev * newEase;
  else next = prev * newEase * 1.3;
  // always move forward by at least a day
  return Math.max(prev + 1, Math.round(next));
}

export function schedule(state: SrsState, rating: Rating, now: Date, tz: string): SrsResult {
  const ease = nextEase(state.ease, rating);
  if (rating === 1) {
    return {
      ease,
      intervalDays: 0,
      reps: 0,
      lapses: state.reps > 0 ? state.lapses + 1 : state.lapses,
      due: new Date(now.getTime() + RELEARN_MINUTES * 60000),
    };
  }
  const intervalDays = nextInterval(state, rating, ease);
  const dueKey = addDays(dayKey(now, tz), intervalDays);
  return { ease, intervalDays, reps: state.reps + 1, lapses: state.lapses, due: startOfDay(dueKey, tz) };
}

export function formatInterval(days: number): string {
  if (days <= 0) return `${RELEARN_MINUTES}m`;
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

/** Interval labels shown on each button before answering. */
export function previewIntervals(state: SrsState): Record<Rating, string> {
  const out = {} as Record<Rating, string>;
  for (const r of [1, 2, 3, 4] as Rating[]) {
    if (r === 1) out[r] = formatInterval(0);
    else out[r] = formatInterval(nextInterval(state, r, nextEase(state.ease, r)));
  }
  return out;
}

/** A card counts as "learned" once it has graduated to a ≥ 1-day interval. */
export function isLearned(state: Pick<SrsState, "intervalDays">): boolean {
  return state.intervalDays >= 1;
}
