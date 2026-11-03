# Taiwan Mandarin Tutor

A personal, mobile-first Mandarin tutor for learners heading to Taiwan: **Traditional characters,
Taiwan-standard pronunciation, pinyin and Zhuyin (ㄅㄆㄇㄈ)**, organized by **TOCFL level** starting
at Novice.

- **Vocabulary**: 300 high-frequency words, each with characters, pinyin, Zhuyin, English, an example
  sentence and audio. It includes themed sets for campus life, food, the MRT and IT/cybersecurity.
- **Spaced repetition**: SM-2 scheduling with Again / Hard / Good / Easy, 10 new cards a day, and a review queue with due counts.
- **Pronunciation**: tone ID, minimal pairs (媽/麻/馬/罵), shadowing with mic recording and a pitch
  graph, accuracy per tone, and re-drills of your weakest tone.
- **Progress dashboard**: streak, words learned, cards due, tone accuracy, a 30-day activity chart and a
  suggested 20-minute daily session.

Stack: Next.js 16 (App Router) + TypeScript, Prisma + SQLite, Tailwind CSS v4, Web Speech API (zh-TW
voice) and Web Audio API.

---

## Setup

Requirements: **Node.js 20+** and npm.

```bash
cd mandarin-tutor
npm install
cp .env.example .env          # then set ADMIN_EMAIL to your email
npx prisma migrate deploy     # creates prisma/dev.db
npx prisma db seed            # loads the 300 words
npm run dev                   # http://localhost:3000
```

Open it on your phone: run `npm run dev -- -H 0.0.0.0`, then visit `http://<your-computer-ip>:3000` on the
same Wi-Fi. Microphone recording needs HTTPS or `localhost`, so test shadowing on the computer, or
use a tunnel such as `cloudflared tunnel --url http://localhost:3000`.

### Audio: install a Taiwan voice

The app speaks through the browser's speech synthesis and prefers a **zh-TW** voice:

| Device | How to install |
|---|---|
| iPhone / iPad | Settings → Accessibility → Spoken Content → Voices → Chinese (Taiwan) → Mei-Jia |
| macOS | System Settings → Accessibility → Spoken Content → System voice → Manage Voices → Chinese (Taiwan) |
| Android | Settings → Text-to-speech → Google → Install voice data → 中文 (台灣) |
| Windows | Settings → Time & language → Speech → Add voices → Chinese (Traditional, Taiwan) |

If **no Chinese voice** is installed, every audio button plays a **synthesized pitch contour** instead
(Web Audio API): tone 1 = 55, tone 2 = 35, tone 3 = 214, tone 4 = 51. It follows real sandhi (3+3 → 2+3,
half-third before other tones) and context-dependent neutral-tone pitch. You can still do the tone
exercises by ear this way. The 〰️ *Contour* buttons play these shapes on demand at any time.
**Settings → Audio** shows which voice is in use and lets you pick a voice and speed.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build && npm start` | Production build / server |
| `npm test` | Unit tests (Vitest): pinyin/Zhuyin, SM-2, dates/streaks, tone stats, session plan, pitch detection, **dataset validation** |
| `npm run test:e2e` | End-to-end tests (Playwright, mobile viewport, fake microphone) against a fresh `prisma/e2e.db` |
| `npm run db:seed` | Re-run the seed (idempotent: updates words in place, keeps progress) |
| `npx tsx scripts/demo-data.ts` | Fill a **demo** database with 30 days of fake history (refuses to run unless `DATABASE_URL` contains "demo") |

For e2e tests on a machine without Playwright's bundled Chromium, run `npx playwright install chromium`
or set `CHROMIUM_PATH` to an existing Chromium.

---

## How it works

### Content (`src/data/`)

Each word is written **once** in numbered pinyin (`xue2sheng1`), in the same line as its characters and
example. Tone-marked pinyin (`xuéshēng`) and Zhuyin (`ㄒㄩㄝˊ ㄕㄥ`) are generated from that source
(`src/lib/pinyin.ts`), so the three can't disagree. The unit tests check the dataset:

- exactly 300 words, no duplicates, the right count per themed set;
- one pinyin syllable per character, in both the headword and the example sentence;
- every example contains its headword, with the same pinyin;
- every syllable is valid pinyin that converts to Zhuyin;
- no common Simplified characters.

**Taiwan pronunciation** is used where it differs from mainland norms, for example 星期 *xīngqí*,
學期 *xuéqí*, 垃圾 *lèsè*, 和 *hàn*, 誰 *shéi*, 檔案 *dǎng'àn* and 攻擊 *gōngjí*. Many words that are
neutral-tone in Beijing Mandarin keep their full tone here (朋友 *péngyǒu*, 喜歡 *xǐhuān*, 東西 *dōngxī*),
the way Taiwan textbooks mark them. Vocabulary is Taiwan usage too: 捷運, 悠遊卡, 機車, 便當, 網路,
軟體, 資料, 程式, 伺服器 and 駭客.

**TOCFL levels**: Novice 1/2 (準備級), Level 1–2 (Band A), Level 3–4 (Band B). Levels are
approximate. They're based on the TOCFL 8000-word list where a word appears, and on difficulty otherwise. Most
IT and security terms sit in Band B. Check them against the official list if exact levels matter to you.

### Spaced repetition (`src/lib/srs.ts`)

SM-2 with four buttons: Hard / Good / Easy map to quality 3 / 4 / 5, and the ease factor follows the SM-2
formula (minimum 1.3). Intervals go 1 day, then 6 days, then interval × ease. Hard grows more slowly (×1.2),
Easy gets a 1.3× bonus, and Easy on a new card jumps to 4 days. **Again** restarts the card: it comes back
in 10 minutes (and later in the same session), and ease drops by 0.2. Due dates fall on local midnight,
so "due tomorrow" means all of tomorrow. Each day introduces up to **10 new cards** (adjustable in Settings), from your chosen TOCFL level
first, interleaving core words with the themed sets. A word counts as **learned** after two successful
recalls in a row, or after you mark it Easy.

### Pronunciation

- **Tone ID**: 20 items per round, a mix of single syllables (tones 1–4) and two-syllable words for the
  neutral tone ("which tone is the 2nd syllable?"). Characters stay hidden until you answer.
- **Minimal pairs**: four-tone sets (媽麻馬罵, 湯糖躺燙, 書熟鼠樹…) and word pairs (睡覺/水餃,
  教室/教師, 大學/大雪…). After answering, you can play every option to compare.
- **Shadowing**: sentences come from words you're learning, then upcoming words. Listen (normal or slow), record yourself,
  then play the model, your recording, or both back-to-back. A **pitch graph** plots your voice's
  pitch (autocorrelation, in semitones relative to your own median) over the target tone shapes. Then
  you rate yourself.
- **Per-tone accuracy** comes from your last 500 tone-ID and minimal-pair answers. Your **weakest tone** is the lowest
  smoothed accuracy, (correct+1)/(attempts+2), among tones with at least 5 answers and below 90%. The app
  also shows which tone you most often confuse it with. *Drill weakest tone* makes 60% of the items that tone.

### Progress

Days and streaks use your browser's time zone. The streak survives until the end of today even if you
haven't studied yet. The **20-minute plan** puts a tone warm-up on your weakest tone first, then due reviews,
then new cards, and gives the remaining time to shadowing. Each step shows a progress bar for today's
activity.

### Data model (`prisma/schema.prisma`)

`Word` (shared content) · `Card` (SM-2 state per user per word) · `ReviewLog` · `ToneAttempt` ·
`ShadowAttempt` · `ActivityDay` (per-day counters in the learner's time zone) · `StudySession` (a run of
activity with no gap over 30 minutes).

In Phase 1 there is no login. All progress belongs to the user whose email is `ADMIN_EMAIL`. When
accounts are added, signing in with that email keeps everything.

---

## Project layout

```
prisma/            schema, migrations, seed
scripts/           demo-data generator
src/data/          vocabulary (core + themed sets), tone drill items, minimal pairs
src/lib/           pinyin/Zhuyin, SM-2, dates, tone stats, session plan
src/lib/audio/     speech synthesis, tone-contour synth, recorder, pitch tracking
src/lib/server/    Prisma client, current user, review queue, stats, activity tracking
src/app/(app)/     dashboard, review, tones (identify / pairs / shadowing), vocab, settings
src/app/api/       JSON endpoints used by the client components
tests/unit/        Vitest
tests/e2e/         Playwright
```
