/**
 * Pricing tiers for the willingness-to-pay test. Paid tiers are not for sale:
 * clicking them records the choice and offers early access. No one is charged.
 */
export const TIERS = [
  {
    id: "free",
    name: "Free",
    price: 0,
    blurb: "Everything you need to start.",
    features: ["300 core TOCFL Novice words + themed sets", "SM-2 flashcards, 10 new words a day", "Tone ID & minimal pairs", "Progress dashboard & streaks"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 5,
    blurb: "For learners getting ready to move to Taiwan.",
    features: ["Everything in Free", "Full TOCFL word lists, Novice → Band B", "Unlimited shadowing with pitch graphs", "Survival decks: banks, ARC visa, housing, clinics", "Offline mode"],
  },
  {
    id: "proplus",
    name: "Pro+",
    price: 10,
    blurb: "For serious study and exam prep.",
    features: ["Everything in Pro", "Automatic pronunciation scoring", "TOCFL mock listening & reading tests", "Custom decks from your class syllabus", "Priority support"],
  },
] as const;

export type TierId = (typeof TIERS)[number]["id"];
