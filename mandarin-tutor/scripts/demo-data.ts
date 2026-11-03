/**
 * Fill a database with ~30 days of realistic study history for one user, for
 * demos and screenshots. Never run this against your real database:
 *
 *   DATABASE_URL=file:./demo.db npx tsx scripts/demo-data.ts demo@example.com
 */
import { PrismaClient } from "@prisma/client";
import { addDays, dayKey, startOfDay } from "../src/lib/dates";
import { schedule, NEW_CARD, type Rating } from "../src/lib/srs";

const prisma = new PrismaClient();
const email = (process.argv[2] ?? "demo@example.com").toLowerCase();
const tz = "Asia/Taipei";

let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

async function main() {
  if (!process.env.DATABASE_URL?.includes("demo")) {
    throw new Error("Refusing to run: DATABASE_URL must point at a demo database (file name containing 'demo').");
  }
  await prisma.user.deleteMany({ where: { email } });
  const user = await prisma.user.create({ data: { email, timezone: tz, createdAt: new Date(Date.now() - 31 * 86400000) } });
  const words = await prisma.word.findMany({ orderBy: { rank: "asc" } });
  const today = dayKey(new Date(), tz);
  const skip = new Set([4, 11, 12, 19, 26]); // days off (days ago)
  let wordIdx = 0;
  const cards = new Map<number, { id: string; state: typeof NEW_CARD & { due: Date } }>();

  for (let ago = 29; ago >= 0; ago--) {
    if (skip.has(ago)) continue;
    const date = addDays(today, -ago);
    const base = startOfDay(date, tz).getTime() + (19 + rand() * 3) * 3600000; // evening study
    let t = base;
    const now = () => new Date((t += 12000 + rand() * 20000));
    let reviews = 0, newCards = 0, toneDrills = 0, shadowing = 0;

    // due reviews
    for (const [wordId, c] of cards) {
      if (c.state.due.getTime() > t) continue;
      const r = (rand() < 0.1 ? 1 : rand() < 0.2 ? 2 : rand() < 0.85 ? 3 : 4) as Rating;
      const at = now();
      const next = schedule(c.state, r, at, tz);
      await prisma.card.update({ where: { id: c.id }, data: { ...next, lastReviewedAt: at } });
      await prisma.reviewLog.create({ data: { userId: user.id, cardId: c.id, rating: r, wasNew: false, intervalBefore: c.state.intervalDays, intervalAfter: next.intervalDays, easeAfter: next.ease, createdAt: at } });
      c.state = next;
      cards.set(wordId, c);
      reviews++;
    }
    // new cards (fewer on some days)
    const n = ago === 0 ? 4 : rand() < 0.7 ? 10 : 5;
    for (let k = 0; k < n && wordIdx < words.length; k++) {
      const w = words[wordIdx++];
      const r = (rand() < 0.15 ? 1 : rand() < 0.8 ? 3 : 4) as Rating;
      const at = now();
      const next = schedule(NEW_CARD, r, at, tz);
      const card = await prisma.card.create({ data: { userId: user.id, wordId: w.id, ...next, introducedAt: at, lastReviewedAt: at } });
      await prisma.reviewLog.create({ data: { userId: user.id, cardId: card.id, rating: r, wasNew: true, intervalBefore: 0, intervalAfter: next.intervalDays, easeAfter: next.ease, createdAt: at } });
      cards.set(w.id, { id: card.id, state: next });
      reviews++;
      newCards++;
    }
    // tone drills: 3rd tone is the weak one (often heard as 2nd), improving over the month
    const drills = 10 + Math.floor(rand() * 15);
    for (let k = 0; k < drills; k++) {
      const expected = 1 + Math.floor(rand() * 5);
      const pWrong = expected === 3 ? 0.45 - (29 - ago) * 0.006 : expected === 5 ? 0.2 : 0.08;
      const answered = rand() < pWrong ? (expected === 3 ? 2 : ((expected % 5) + 1)) : expected;
      await prisma.toneAttempt.create({ data: { userId: user.id, exercise: rand() < 0.7 ? "tone-id" : "minimal-pair", prompt: "demo", expectedTone: expected, answeredTone: answered, correct: expected === answered, createdAt: now() } });
      toneDrills++;
    }
    // shadowing
    const sh = rand() < 0.6 ? 3 + Math.floor(rand() * 4) : 0;
    for (let k = 0; k < sh; k++) {
      await prisma.shadowAttempt.create({ data: { userId: user.id, wordId: words[Math.floor(rand() * wordIdx)].id, rating: 2 + Math.floor(rand() * 3), createdAt: now() } });
      shadowing++;
    }
    await prisma.studySession.create({ data: { userId: user.id, startedAt: new Date(base), lastActiveAt: new Date(t) } });
    await prisma.activityDay.create({ data: { userId: user.id, date, reviews, newCards, toneDrills, shadowing, activeSeconds: Math.round((t - base) / 1000) } });
  }
  // already answered the survey, so it doesn't pop up in screenshots
  await prisma.surveyResponse.create({ data: { userId: user.id, level: "novice", reason: "study", mostUseful: "toneId", wtp: "5-9" } });
  console.log(`Demo history created for ${email}: ${cards.size} cards.`);
}

main().finally(() => prisma.$disconnect());
