import type { Tone } from "./pinyin";
import { TONE_SHORT } from "./pinyin";

export interface PlanInput {
  dueCount: number;
  newAvailable: number;
  weakest: Tone | null;
  today: { reviews: number; newCards: number; toneDrills: number; shadowing: number };
}

export interface PlanStep {
  id: "tones" | "review" | "new" | "shadow";
  title: string;
  detail: string;
  minutes: number;
  target: number;
  done: number;
  href: string;
}

const SECONDS_PER_REVIEW = 10;
const SECONDS_PER_NEW = 40;
const SECONDS_PER_TONE = 12;
const SECONDS_PER_SHADOW = 60;

/**
 * A suggested 20-minute session: tone warm-up on the weakest tone, due reviews,
 * today's new cards, then shadowing with whatever time remains.
 */
export function suggestSession(input: PlanInput, totalMinutes = 20): PlanStep[] {
  const budget = totalMinutes * 60;
  const toneSecs = 4 * 60;
  const reviewTarget = Math.min(input.dueCount + input.today.reviews, Math.floor((8 * 60) / SECONDS_PER_REVIEW));
  const reviewSecs = reviewTarget * SECONDS_PER_REVIEW;
  const newTarget = input.newAvailable + input.today.newCards;
  const newSecs = Math.min(newTarget * SECONDS_PER_NEW, 7 * 60);
  const shadowSecs = Math.max(3 * 60, budget - toneSecs - reviewSecs - newSecs);
  const toneTarget = Math.round(toneSecs / SECONDS_PER_TONE);
  const shadowTarget = Math.max(3, Math.round(shadowSecs / SECONDS_PER_SHADOW));

  const steps: PlanStep[] = [
    {
      id: "tones",
      title: input.weakest ? `Tone warm-up: ${TONE_SHORT[input.weakest]} tone` : "Tone warm-up",
      detail: input.weakest ? "Extra practice on your weakest tone" : "Identify tones by ear",
      minutes: toneSecs / 60,
      target: toneTarget,
      done: Math.min(input.today.toneDrills, toneTarget),
      href: input.weakest ? `/tones/identify?focus=${input.weakest}` : "/tones/identify",
    },
    {
      id: "review",
      title: "Review due cards",
      detail: reviewTarget ? `${input.dueCount} due now` : "Nothing due — nice!",
      minutes: Math.round(reviewSecs / 60),
      target: reviewTarget,
      done: Math.min(input.today.reviews, reviewTarget),
      href: "/review",
    },
    {
      id: "new",
      title: "Learn new words",
      detail: newTarget ? `${input.newAvailable} new left today` : "Daily new-card limit reached",
      minutes: Math.round(newSecs / 60),
      target: newTarget,
      done: Math.min(input.today.newCards, newTarget),
      href: "/review",
    },
    {
      id: "shadow",
      title: "Shadowing",
      detail: "Repeat sentences out loud and compare",
      minutes: Math.round(shadowSecs / 60),
      target: shadowTarget,
      done: Math.min(input.today.shadowing, shadowTarget),
      href: "/tones/shadowing",
    },
  ];
  // Drop empty steps; rebalance so the plan totals the budget.
  const kept = steps.filter((s) => s.target > 0 || s.id === "shadow");
  const used = kept.reduce((a, s) => a + s.minutes, 0);
  const shadow = kept.find((s) => s.id === "shadow")!;
  shadow.minutes = Math.max(3, shadow.minutes + (totalMinutes - used));
  shadow.target = Math.max(3, Math.round((shadow.minutes * 60) / SECONDS_PER_SHADOW));
  shadow.done = Math.min(input.today.shadowing, shadow.target);
  return kept;
}
