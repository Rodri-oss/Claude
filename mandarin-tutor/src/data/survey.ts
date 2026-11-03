/** In-app survey shown after a learner's 5th study session. */
export const SURVEY = {
  level: {
    question: "What's your Mandarin level?",
    options: [
      { id: "beginner", label: "Complete beginner" },
      { id: "novice", label: "Novice: I know some basics" },
      { id: "bandA", label: "TOCFL Band A (Level 1–2)" },
      { id: "bandB", label: "TOCFL Band B or higher" },
    ],
  },
  reason: {
    question: "Why are you learning Mandarin?",
    options: [
      { id: "study", label: "Studying in Taiwan" },
      { id: "work", label: "Working in Taiwan" },
      { id: "moving", label: "Moving to / living in Taiwan" },
      { id: "family", label: "Family or partner" },
      { id: "travel", label: "Travel" },
      { id: "heritage", label: "Heritage / cultural roots" },
      { id: "other", label: "Something else" },
    ],
  },
  mostUseful: {
    question: "Which feature is most useful to you?",
    options: [
      { id: "flashcards", label: "Flashcards (spaced repetition)" },
      { id: "toneId", label: "Tone ID drills" },
      { id: "pairs", label: "Minimal pairs" },
      { id: "shadowing", label: "Shadowing" },
      { id: "dashboard", label: "Dashboard & daily plan" },
      { id: "taiwanVocab", label: "Taiwan-specific vocabulary" },
    ],
  },
  wtp: {
    question: "What would you pay per month for this app?",
    options: [
      { id: "0", label: "$0, only if it's free" },
      { id: "1-4", label: "$1–4" },
      { id: "5-9", label: "$5–9" },
      { id: "10-14", label: "$10–14" },
      { id: "15+", label: "$15 or more" },
    ],
  },
} as const;

export const SURVEY_AFTER_SESSIONS = 5;
export const SURVEY_MAX_DISMISSALS = 3;
