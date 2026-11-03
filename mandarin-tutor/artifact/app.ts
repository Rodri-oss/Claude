/**
 * Standalone single-page version of the tutor (Phase 1 features) for hosting
 * as a Claude artifact. Reuses the app's tested logic from src/lib and the
 * same 300-word dataset. Progress is kept in the artifact's private per-user
 * store when available, with a browser-storage copy as a fallback.
 */
import { buildVocab, CATEGORIES, LEVELS, LEVEL_IDS, type VocabEntry } from "../src/data/vocab";
import { PAIR_SETS, TONE_ITEMS, type PairSet, type ToneItem } from "../src/data/tones";
import { NEW_CARD, previewIntervals, RATING_LABELS, schedule, isLearned, type Rating, type SrsState } from "../src/lib/srs";
import { addDays, computeStreak, dayKey, lastNDays, longestStreak, startOfDay } from "../src/lib/dates";
import { CHAO, syllables, tonesOf, toToneMarks, toZhuyin, TONE_SHORT, contourFor, type Tone } from "../src/lib/pinyin";
import { pickTone, toneStats, topConfusion, weakestTone, type ToneStat } from "../src/lib/toneStats";
import { suggestSession } from "../src/lib/plan";
import { speak, pickVoice, loadVoices, chineseVoices, setPreferredVoice, getRate, setRate } from "../src/lib/audio/speech";
import { playContourFor, playTones } from "../src/lib/audio/contour";
import { pitchFromBlob, type PitchPoint } from "../src/lib/audio/pitch";

// ---------------------------------------------------------------------------
// Data & state
// ---------------------------------------------------------------------------

const VOCAB = buildVocab();
const BY_HANZI = new Map(VOCAB.map((v) => [v.hanzi, v]));

/** [ease, intervalDays, reps, lapses, dueMs, introducedMs] */
type CardTuple = [number, number, number, number, number, number];
/** [reviews, newCards, toneDrills, shadowing, seconds] */
type DayTuple = [number, number, number, number, number];

interface Progress {
  v: 1;
  timezone: string;
  showPinyin: boolean;
  showZhuyin: boolean;
  newPerDay: number;
  level: string;
  deck: string;
  cards: Record<string, CardTuple>;
  /** recent tone answers: [expected, answered, timeMs] (last 500) */
  tones: [number, number, number][];
  days: Record<string, DayTuple>;
  lastActive: number;
  sessions: number;
  updatedAt: number;
}

function defaultProgress(): Progress {
  return {
    v: 1,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Taipei",
    showPinyin: true,
    showZhuyin: true,
    newPerDay: 10,
    level: "N1",
    deck: "all",
    cards: {},
    tones: [],
    days: {},
    lastActive: 0,
    sessions: 0,
    updatedAt: 0,
  };
}

let P: Progress = defaultProgress();
const LS_KEY = "mt.progress.v1";

// ---------------------------------------------------------------------------
// Storage: private per-user db doc, with a localStorage copy
// ---------------------------------------------------------------------------

type DbDoc = { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void> };
let remote: DbDoc | null = null;
let syncState: "loading" | "account" | "device" = "loading";
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saving = false;
let pendingSave = false;

function parseProgress(raw: unknown): Progress | null {
  try {
    const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!obj || obj.v !== 1) return null;
    return { ...defaultProgress(), ...obj };
  } catch {
    return null;
  }
}

function loadLocal(): Progress | null {
  try {
    return parseProgress(localStorage.getItem(LS_KEY));
  } catch {
    return null;
  }
}

function save() {
  P.updatedAt = Date.now();
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(P));
  } catch {}
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushRemote, 1200);
}

async function flushRemote() {
  if (!remote) return;
  if (saving) {
    pendingSave = true;
    return;
  }
  saving = true;
  try {
    await remote.set({ v: 1, updatedAt: P.updatedAt, data: JSON.stringify(P) });
    setSync("account");
  } catch {
    setSync("device");
  } finally {
    saving = false;
    if (pendingSave) {
      pendingSave = false;
      void flushRemote();
    }
  }
}

function setSync(s: typeof syncState) {
  syncState = s;
  const el = document.getElementById("sync");
  if (!el) return;
  el.textContent = s === "account" ? "Saved to your account" : s === "device" ? "Saved on this device" : "Loading…";
  el.dataset.state = s;
}

async function initStorage() {
  const local = loadLocal();
  if (local) P = local;
  const claude = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
  if (!claude?.use) {
    setSync("device");
    return;
  }
  const timeout = setTimeout(() => syncState === "loading" && setSync("device"), 10000);
  try {
    const [db, user] = (await Promise.all([claude.use("db"), claude.use("user")])) as [
      { doc(p: string): DbDoc } | null,
      { id(): Promise<string | null> } | null,
    ];
    const uid = user ? await user.id() : null;
    if (!db || !uid) {
      setSync("device");
      return;
    }
    remote = db.doc(`data/users/${uid}/progress`);
    const snap = await remote.get();
    const stored = snap.exists ? parseProgress(snap.data()?.data) : null;
    if (stored && stored.updatedAt >= (local?.updatedAt ?? 0)) {
      P = stored;
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(P));
      } catch {}
      render();
    } else if (local && local.updatedAt > 0) {
      await flushRemote();
    }
    setSync("account");
  } catch {
    setSync("device");
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Domain helpers (mirroring the server code)
// ---------------------------------------------------------------------------

const tz = () => P.timezone;
const todayKey = () => dayKey(new Date(), tz());

function cardState(h: string): (SrsState & { due: number; introducedAt: number }) | null {
  const c = P.cards[h];
  return c ? { ease: c[0], intervalDays: c[1], reps: c[2], lapses: c[3], due: c[4], introducedAt: c[5] } : null;
}

function recordActivity(inc: Partial<{ reviews: number; newCards: number; toneDrills: number; shadowing: number }>) {
  const t = Date.now();
  let credit: number;
  if (P.lastActive && t - P.lastActive <= 30 * 60_000) credit = Math.min(120_000, t - P.lastActive);
  else {
    credit = 15_000;
    P.sessions++;
  }
  P.lastActive = t;
  const d = todayKey();
  const row = (P.days[d] ??= [0, 0, 0, 0, 0]);
  row[0] += inc.reviews ?? 0;
  row[1] += inc.newCards ?? 0;
  row[2] += inc.toneDrills ?? 0;
  row[3] += inc.shadowing ?? 0;
  row[4] += Math.round(credit / 1000);
  save();
}

function introducedToday(): number {
  const start = startOfDay(todayKey(), tz()).getTime();
  return Object.values(P.cards).filter((c) => c[5] >= start).length;
}

function orderedUnseen(): VocabEntry[] {
  const start = Math.max(0, LEVEL_IDS.indexOf(P.level as never));
  const lo = (l: string) => {
    const i = LEVEL_IDS.indexOf(l as never);
    return i >= start ? i - start : LEVEL_IDS.length + i;
  };
  return VOCAB.filter((w) => !P.cards[w.hanzi] && (P.deck === "all" || w.category === P.deck)).sort(
    (a, b) => lo(a.level) - lo(b.level) || a.rank - b.rank,
  );
}

interface QueueCard {
  word: VocabEntry;
  isNew: boolean;
}

function buildQueue(): QueueCard[] {
  const t = Date.now();
  const due = Object.entries(P.cards)
    .filter(([, c]) => c[4] <= t)
    .sort((a, b) => a[1][4] - b[1][4])
    .map(([h]) => ({ word: BY_HANZI.get(h)!, isNew: false }))
    .filter((c) => c.word);
  const fresh = orderedUnseen()
    .slice(0, Math.max(0, P.newPerDay - introducedToday()))
    .map((w) => ({ word: w, isNew: true }));
  const out: QueueCard[] = [];
  let ni = 0;
  due.forEach((c, i) => {
    out.push(c);
    if ((i + 1) % 4 === 0 && ni < fresh.length) out.push(fresh[ni++]);
  });
  while (ni < fresh.length) out.push(fresh[ni++]);
  return out;
}

function answerCard(word: VocabEntry, rating: Rating) {
  const existing = cardState(word.hanzi);
  const before = existing ?? { ...NEW_CARD };
  const next = schedule(before, rating, new Date(), tz());
  P.cards[word.hanzi] = [next.ease, next.intervalDays, next.reps, next.lapses, next.due.getTime(), existing?.introducedAt ?? Date.now()];
  recordActivity({ reviews: 1, newCards: existing ? 0 : 1 });
  return next;
}

function recordTone(expected: Tone, answered: Tone) {
  P.tones.push([expected, answered, Date.now()]);
  if (P.tones.length > 500) P.tones.splice(0, P.tones.length - 500);
  recordActivity({ toneDrills: 1 });
}

function toneData() {
  const attempts = P.tones.map(([e, a]) => ({ expectedTone: e, answeredTone: a, correct: e === a }));
  const stats = toneStats(attempts);
  const weakest = weakestTone(stats);
  return { stats, weakest, confusedWith: weakest ? topConfusion(attempts, weakest) : null, total: attempts.length };
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const main = () => document.getElementById("view")!;

function reading(pinyin: string, zhuyin: string, cls = "") {
  if (!P.showPinyin && !P.showZhuyin) return "";
  return `<div class="reading ${cls}">${P.showPinyin ? `<div class="py">${esc(pinyin)}</div>` : ""}${
    P.showZhuyin ? `<div class="zy" lang="zh-TW">${esc(zhuyin)}</div>` : ""
  }</div>`;
}

const TONE_VAR: Record<Tone, string> = { 1: "var(--t1)", 2: "var(--t2)", 3: "var(--t3)", 4: "var(--t4)", 5: "var(--t5)" };

function toneShape(t: Tone, size = 26) {
  const pts = t === 5 ? [3] : CHAO[t];
  const y = (l: number) => 4 + ((5 - l) / 4) * (size - 8);
  const xs = pts.length === 1 ? [size / 2] : pts.map((_, i) => 4 + (i / (pts.length - 1)) * (size - 8));
  const guide = `<line x1="2" x2="${size - 2}" y1="${y(1)}" y2="${y(1)}" stroke="var(--line)"/><line x1="2" x2="${size - 2}" y1="${y(5)}" y2="${y(5)}" stroke="var(--line)"/>`;
  const mark =
    pts.length === 1
      ? `<circle cx="${xs[0]}" cy="${y(pts[0])}" r="3" fill="${TONE_VAR[t]}"/>`
      : `<polyline points="${pts.map((p, i) => `${xs[i]},${y(p)}`).join(" ")}" fill="none" stroke="${TONE_VAR[t]}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">${guide}${mark}</svg>`;
}

function toneAccuracy(stats: ToneStat[], weakest: Tone | null) {
  return `<ul class="acc">${stats
    .map((s) => {
      const pct = s.accuracy == null ? null : Math.round(s.accuracy * 100);
      return `<li title="${TONE_SHORT[s.tone]} tone: ${s.correct}/${s.attempts} correct">${toneShape(s.tone, 22)}<span class="acc-name">${TONE_SHORT[s.tone]}</span><span class="bar"><span style="width:${pct == null ? 0 : Math.max(pct, 2)}%;background:${s.tone === weakest ? "var(--accent)" : "var(--s1)"}"></span></span><span class="acc-val">${pct == null ? '<span class="muted">no data</span>' : `${pct}% <span class="muted">(${s.attempts})</span>`}</span></li>`;
    })
    .join("")}</ul>`;
}

const LEVEL_NAME = (id: string) => LEVELS.find((l) => l.id === id)?.name ?? id;
const CAT = (id: string) => CATEGORIES.find((c) => c.id === id);

function wordDetails(w: VocabEntry) {
  return `<div class="details">
    ${reading(w.pinyin, w.zhuyin, "center big")}
    <p class="meaning">${esc(w.english)}</p>
    <div class="example">
      <button class="play sm" data-act="say" data-text="${esc(w.exZh)}" data-py="${esc(w.exPinyinNum)}" aria-label="Play example">▶</button>
      <div class="ex-body">
        <p class="han ex-zh" lang="zh-TW">${esc(w.exZh)}</p>
        ${reading(w.exPinyin, w.exZhuyin, "small")}
        <p class="muted">${esc(w.exEn)}</p>
      </div>
    </div>
    <div class="row center">
      <button class="chip" data-act="say-slow" data-text="${esc(w.hanzi)}" data-py="${esc(w.pinyinNum)}">Slow</button>
      <button class="chip" data-act="contour" data-py="${esc(w.pinyinNum)}">Tone contour</button>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

type View = "today" | "review" | "tones" | "identify" | "pairs" | "shadow" | "words" | "options";
const VIEWS: View[] = ["today", "review", "tones", "identify", "pairs", "shadow", "words", "options"];
let view: View = "today";
let focusTone: Tone | null = null;

function currentView(): View {
  const h = location.hash.replace("#", "");
  const [name, arg] = h.split("-");
  focusTone = /^[1-5]$/.test(arg ?? "") ? (Number(arg) as Tone) : null;
  return VIEWS.includes(name as View) ? (name as View) : "today";
}

function go(v: string) {
  if (location.hash === "#" + v) render();
  else location.hash = v;
}

// --- Today ------------------------------------------------------------------

function viewToday() {
  const today = todayKey();
  const t = Date.now();
  const cards = Object.values(P.cards);
  const activeDates = Object.entries(P.days).filter(([, d]) => d[0] + d[2] + d[3] > 0).map(([k]) => k);
  const endOfToday = startOfDay(addDays(today, 1), tz()).getTime();
  const dueNow = cards.filter((c) => c[4] <= t).length;
  const dueLater = cards.filter((c) => c[4] > t && c[4] <= endOfToday).length;
  const learned = cards.filter((c) => isLearned({ intervalDays: c[1], reps: c[2] })).length;
  const newAvail = Math.min(Math.max(0, P.newPerDay - introducedToday()), orderedUnseen().length);
  const row = P.days[today] ?? [0, 0, 0, 0, 0];
  const tones = toneData();
  const plan = suggestSession({
    dueCount: dueNow,
    newAvailable: newAvail,
    weakest: tones.weakest,
    today: { reviews: row[0] - row[1], newCards: row[1], toneDrills: row[2], shadowing: row[3] },
  });
  const planMin = plan.reduce((a, s) => a + s.minutes, 0);
  const hrefFor = (h: string) => (h.startsWith("/tones/identify") ? (tones.weakest ? `#identify-${tones.weakest}` : "#identify") : h === "/review" ? "#review" : "#shadow");
  const days30 = lastNDays(today, 30).map((d) => ({ date: d, r: P.days[d] ?? [0, 0, 0, 0, 0] }));
  const learnedByLevel = (lvl: string) => VOCAB.filter((w) => w.level === lvl && P.cards[w.hanzi] && isLearned({ intervalDays: P.cards[w.hanzi][1], reps: P.cards[w.hanzi][2] })).length;
  const dateLabel = new Date(today + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

  return `
  <p class="muted">${dateLabel}</p>
  <h1><span class="han" lang="zh-TW">加油！</span> Let's study.</h1>
  <section class="tiles">
    ${tile("Day streak", String(computeStreak(activeDates, today)), "days", `Longest: ${longestStreak(activeDates)}`)}
    ${tile("Words learned", String(learned), `/ ${VOCAB.length}`, `${cards.length} started`)}
    ${tile("Cards due", String(dueNow), "", dueLater ? `+${dueLater} later today` : `${newAvail} new available`, "review")}
    ${tile("Studied today", String(Math.round(row[4] / 60)), "min", "Goal: 20 min")}
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Today's ${planMin}-minute session</h2><span class="muted small">${plan.filter((s) => s.target > 0 && s.done >= s.target).length}/${plan.length} done</span></div>
    <ol class="plan">${plan
      .map((s, i) => {
        const complete = s.target > 0 && s.done >= s.target;
        const pct = s.target ? Math.min(100, Math.round((s.done / s.target) * 100)) : 0;
        return `<li><span class="step ${complete ? "done" : ""}">${complete ? "✓" : i + 1}</span>
          <div class="grow"><div class="spread"><b>${esc(s.title)}</b><span class="muted small">${s.minutes} min</span></div>
          <p class="muted small">${esc(s.detail)}${s.target > 0 ? ` · ${s.done}/${s.target}` : ""}</p>
          ${s.target > 0 ? `<div class="progress"><span style="width:${pct}%"></span></div>` : ""}</div>
          <a class="btn ${complete ? "ghost" : "primary"} sm" href="${hrefFor(s.href)}">${complete ? "More" : "Start"}</a></li>`;
      })
      .join("")}</ol>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Tone accuracy</h2><a href="#tones" class="link small">Practice →</a></div>
    ${toneAccuracy(tones.stats, tones.weakest)}
    ${tones.weakest ? `<p class="small" style="margin-top:10px">Weakest: <b>${TONE_SHORT[tones.weakest]} tone</b>${tones.confusedWith ? ` (often heard as ${TONE_SHORT[tones.confusedWith]})` : ""}. <a class="link" href="#identify-${tones.weakest}">Re-drill it</a></p>` : ""}
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Last 30 days</h2><span class="muted small">${days30.filter((d) => d.r[0] + d.r[2] + d.r[3] > 0).length} active days</span></div>
    ${activityChart(days30)}
  </section>
  <section class="panel">
    <h2>TOCFL progress</h2>
    <ul class="levels">${LEVELS.map((l) => {
      const total = VOCAB.filter((w) => w.level === l.id).length;
      const n = learnedByLevel(l.id);
      return `<li><span>${l.name}</span><span class="bar"><span style="width:${total ? (n / total) * 100 : 0}%;background:var(--s1)"></span></span><span class="muted small num">${n}/${total}</span></li>`;
    }).join("")}</ul>
  </section>`;
}

function tile(label: string, value: string, unit: string, sub: string, href?: string) {
  const inner = `<p class="tile-label">${label}</p><p class="tile-value">${value}${unit ? ` <span>${unit}</span>` : ""}</p><p class="muted small">${sub}</p>`;
  return href ? `<a class="tile" href="#${href}">${inner}</a>` : `<div class="tile">${inner}</div>`;
}

function activityChart(days: { date: string; r: DayTuple }[]) {
  const W = 340, H = 150, L = 28, R = 4, T = 8, B = 20;
  const series = [
    { i: 0, label: "Card reviews", color: "var(--s1)" },
    { i: 2, label: "Tone drills", color: "var(--s2)" },
    { i: 3, label: "Shadowing", color: "var(--s3)" },
  ];
  const totals = days.map((d) => d.r[0] + d.r[2] + d.r[3]);
  const raw = Math.max(1, ...totals);
  const max = raw <= 5 ? 5 : (() => { const p = Math.pow(10, Math.floor(Math.log10(raw))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p; return 10 * p; })();
  const band = (W - L - R) / days.length;
  const bw = Math.min(24, band - 2);
  const ph = H - T - B;
  const y = (v: number) => T + ph - (v / max) * ph;
  const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  let bars = "";
  days.forEach((d, i) => {
    const cx = L + band * i + band / 2;
    let acc = 0;
    const segs = series.filter((s) => d.r[s.i] > 0);
    segs.forEach((s, k) => {
      const v = d.r[s.i];
      const top = y(acc + v);
      const bottom = y(acc) - (k > 0 ? 2 : 0);
      acc += v;
      const h = Math.max(0, bottom - top);
      const r = k === segs.length - 1 ? Math.min(4, bw / 2, h) : 0;
      const x0 = cx - bw / 2;
      bars += `<path d="M${x0},${bottom} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${bottom} Z" fill="${s.color}"/>`;
    });
    bars += `<rect x="${L + band * i}" y="${T}" width="${band}" height="${ph}" fill="transparent"><title>${i === days.length - 1 ? "Today" : fmt(d.date)}: ${d.r[0]} reviews, ${d.r[2]} tone drills, ${d.r[3]} shadowing, ${Math.round(d.r[4] / 60)} min</title></rect>`;
  });
  const ticks = [0, max / 2, max].map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 0 ? "var(--axis)" : "var(--grid)"}"/><text x="${L - 4}" y="${y(t) + 3}" text-anchor="end" font-size="9" fill="var(--muted)">${t}</text>`).join("");
  const labels = [0, 14, 29].map((i) => `<text x="${L + band * i + band / 2}" y="${H - 5}" font-size="9" fill="var(--muted)" text-anchor="${i === 0 ? "start" : i === 29 ? "end" : "middle"}">${i === 29 ? "Today" : fmt(days[i].date)}</text>`).join("");
  const rows = days.filter((d) => d.r[0] + d.r[2] + d.r[3] > 0).reverse();
  return `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${s.label}</span>`).join("")}</div>
    <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Activity over the last 30 days">${ticks}${bars}${labels}</svg>
    <details class="small"><summary>Show as table</summary><div class="scroll"><table><thead><tr><th>Date</th><th>Reviews</th><th>Tones</th><th>Shadow</th><th>Min</th></tr></thead><tbody>${
      rows.map((d) => `<tr><td>${d.date}</td><td>${d.r[0]}</td><td>${d.r[2]}</td><td>${d.r[3]}</td><td>${Math.round(d.r[4] / 60)}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">No activity yet</td></tr>'
    }</tbody></table></div></details>`;
}

// --- Review -----------------------------------------------------------------

let rq: { queue: QueueCard[]; pos: number; revealed: boolean; done: number; initialNew: number; startIntro: number } | null = null;

function viewReview() {
  if (!rq) {
    const queue = buildQueue();
    rq = { queue, pos: 0, revealed: false, done: 0, initialNew: queue.filter((c) => c.isNew).length, startIntro: introducedToday() };
  }
  const card = rq.queue[rq.pos];
  const rest = rq.queue.slice(rq.pos);
  if (!card) {
    const limit = rq.startIntro + rq.initialNew >= P.newPerDay;
    return `<div class="empty"><p class="big-emoji">🎉</p><h1>${rq.done ? `Done! ${rq.done} card${rq.done === 1 ? "" : "s"} reviewed.` : "Nothing to review right now."}</h1>
      <p class="muted">${limit ? `You've reached today's limit of ${P.newPerDay} new cards. Come back tomorrow for more.` : "Check back later for cards that come due."}</p>
      <div class="row center"><a class="btn primary" href="#identify">Practice tones</a><a class="btn ghost" href="#today">Back to today</a></div></div>`;
  }
  const w = card.word;
  const show = rq.revealed || card.isNew;
  const st = cardState(w.hanzi) ?? NEW_CARD;
  const prev = previewIntervals(st);
  return `
  <div class="spread small"><span><b style="color:var(--t4)">${rest.filter((c) => c.isNew).length}</b> new &nbsp; <b style="color:var(--t3)">${rest.filter((c) => !c.isNew).length}</b> due</span><span class="muted">${rq.done} done</span></div>
  <article class="panel card">
    <div class="row">${card.isNew ? '<span class="badge new">NEW</span>' : ""}<span class="badge level">TOCFL ${LEVEL_NAME(w.level)}</span><span class="badge">${CAT(w.category)?.name}</span></div>
    <div class="row center hanzi-row"><p class="han hanzi" lang="zh-TW">${esc(w.hanzi)}</p><button class="play" data-act="say" data-text="${esc(w.hanzi)}" data-py="${esc(w.pinyinNum)}" aria-label="Play">▶</button></div>
    ${show ? wordDetails(w) : '<p class="muted center">Recall the reading and meaning, then reveal.</p>'}
  </article>
  ${
    show
      ? `<div class="ratings">${([1, 2, 3, 4] as Rating[]).map((r) => `<button class="rate r${r}" data-act="rate" data-r="${r}">${RATING_LABELS[r]}<small>${prev[r]}</small></button>`).join("")}</div>`
      : `<button class="btn dark wide" data-act="reveal">Show answer</button>`
  }
  <p class="muted small center hide-sm">Keyboard: space to reveal · 1–4 to rate</p>`;
}

function reviewReveal() {
  if (!rq) return;
  rq.revealed = true;
  const c = rq.queue[rq.pos];
  render();
  void speak(c.word.hanzi, { pinyinNum: c.word.pinyinNum });
}

function reviewRate(r: Rating) {
  if (!rq) return;
  const c = rq.queue[rq.pos];
  if (!c) return;
  answerCard(c.word, r);
  rq.done++;
  if (r === 1) rq.queue.splice(Math.min(rq.pos + 4, rq.queue.length), 0, { word: c.word, isNew: false });
  rq.pos++;
  rq.revealed = false;
  render();
}

// --- Tones hub ----------------------------------------------------------------

function viewTones() {
  const t = toneData();
  return `<h1>Pronunciation</h1>
  <div id="voice-note"></div>
  <section class="panel"><div class="panel-head"><h2>Accuracy by tone</h2><span class="muted small">last ${t.total} answers</span></div>
    ${toneAccuracy(t.stats, t.weakest)}
    ${t.weakest
      ? `<div class="callout">Your weakest tone is the <b>${TONE_SHORT[t.weakest]}</b>${t.confusedWith ? `, most often heard as ${TONE_SHORT[t.confusedWith]}` : ""}.
         <div class="row"><a class="btn primary sm" href="#identify-${t.weakest}">Drill ${TONE_SHORT[t.weakest]} tone</a><a class="btn ghost sm" href="#pairs-${t.weakest}">Minimal pairs</a></div></div>`
      : '<p class="muted small" style="margin-top:10px">Answer at least 5 items per tone to find your weakest tone.</p>'}
  </section>
  <div class="ex-list">
    ${[["identify", "聽聲調", "Tone ID", "Hear a syllable, pick tone 1–4 or neutral."], ["pairs", "媽麻馬罵", "Minimal pairs", "Tell apart words that differ only by tone."], ["shadow", "跟讀", "Shadowing", "Listen, record yourself, compare, self-rate."]]
      .map(([h, zh, title, desc]) => `<a class="panel ex" href="#${h}"><span class="han ex-zh-big" lang="zh-TW">${zh}</span><span><b>${title}</b><span class="muted small block">${desc}</span></span></a>`)
      .join("")}
  </div>`;
}

// --- Tone ID ------------------------------------------------------------------

const ROUND_ID = 20;
let ti: { item: ToneItem | null; answer: Tone | null; started: boolean; right: number; total: number; results: boolean; focus: Tone | null } | null = null;

function nextToneItem(focus: Tone | null, prev?: ToneItem | null): ToneItem {
  for (;;) {
    const tone = pickTone(focus);
    const pool = TONE_ITEMS.filter((i) => i.tone === tone && i.id !== prev?.id);
    const it = pool[Math.floor(Math.random() * pool.length)];
    if (it) return it;
  }
}

function viewIdentify() {
  if (!ti || ti.focus !== focusTone) ti = { item: null, answer: null, started: false, right: 0, total: 0, results: false, focus: focusTone };
  const s = ti;
  const t = toneData();
  if (s.results) {
    return `<div class="empty"><h1>Round complete</h1><p class="score">${s.right} / ${s.total}</p>
      <section class="panel left">${toneAccuracy(t.stats, t.weakest)}</section>
      <div class="row center">${t.weakest ? `<button class="btn primary" data-act="id-restart" data-focus="${t.weakest}">Drill ${TONE_SHORT[t.weakest]} tone</button>` : ""}<button class="btn ghost" data-act="id-restart" data-focus="${s.focus ?? ""}">Another round</button></div>
      <a href="#tones" class="link small">Back to tones</a></div>`;
  }
  const it = s.item;
  return `<div class="spread"><h1>Tone ID</h1><span class="muted small num">${s.right}/${s.total} · ${Math.min(s.total + (s.answer ? 0 : 1), ROUND_ID)} of ${ROUND_ID}</span></div>
  ${s.focus ? `<p class="callout">Focus: <b>${TONE_SHORT[s.focus]} tone</b>. It comes up more often this round.</p>` : ""}
  <section class="panel stage">
    ${!s.started
      ? `<button class="btn primary big" data-act="id-start">▶ Start listening</button>`
      : `<button class="play huge" data-act="id-play" aria-label="Play again">▶</button>
         <p class="muted">Which tone is ${it && it.target > 0 ? "the 2nd syllable" : "this syllable"}?</p>
         ${it && it.target > 0 && !s.answer ? '<p class="muted small">(a 2-syllable word: listen to the end)</p>' : ""}`}
    ${s.answer && it
      ? `<div class="feedback"><p class="${s.answer === it.tone ? "ok" : "bad"}">${s.answer === it.tone ? "✓ Correct!" : `✗ That was the ${TONE_SHORT[it.tone]} tone`}</p>
         <p class="han hanzi-md" lang="zh-TW">${esc(it.text)}</p>${reading(toToneMarks(it.pinyinNum), toZhuyin(it.pinyinNum), "center")}
         <div class="row center"><button class="chip" data-act="id-play">Play again</button><button class="chip" data-act="contour" data-py="${esc(it.pinyinNum)}">Tone contour</button></div></div>`
      : ""}
  </section>
  ${s.started
    ? `<div class="tone-btns">${([1, 2, 3, 4, 5] as Tone[]).map((t2) => {
        const right = s.answer && it && t2 === it.tone;
        const wrong = s.answer === t2 && it && t2 !== it.tone;
        return `<button class="tone-btn ${right ? "right" : ""} ${wrong ? "wrong" : ""}" data-act="id-answer" data-t="${t2}" ${s.answer ? "disabled" : ""} aria-label="${TONE_SHORT[t2]} tone">${toneShape(t2)}<span>${t2 === 5 ? "neutral" : t2}</span></button>`;
      }).join("")}</div>`
    : ""}
  ${s.answer ? `<button class="btn dark wide" data-act="id-next">${s.total >= ROUND_ID ? "See results" : "Next →"}</button>` : ""}`;
}

function idPlay() {
  if (ti?.item) void speak(ti.item.text, { pinyinNum: ti.item.pinyinNum });
}

// --- Minimal pairs --------------------------------------------------------------

const ROUND_PAIRS = 15;
let mp: { set: PairSet | null; target: number; picked: number | null; started: boolean; right: number; total: number; results: boolean; focus: Tone | null } | null = null;
const toneAt = (s: PairSet, i: number) => syllables(s.options[i].pinyinNum)[s.diffSyllable].tone as Tone;

function nextPair(focus: Tone | null, prev?: PairSet | null): { set: PairSet; target: number } {
  for (;;) {
    const useFocus = focus && Math.random() < 0.6;
    const pool = useFocus ? PAIR_SETS.filter((s) => s.options.some((_, i) => toneAt(s, i) === focus)) : PAIR_SETS;
    const set = pool[Math.floor(Math.random() * pool.length)];
    const target = useFocus ? set.options.findIndex((_, i) => toneAt(set, i) === focus) : Math.floor(Math.random() * set.options.length);
    if (!prev || prev.id !== set.id) return { set, target };
  }
}

function viewPairs() {
  if (!mp || mp.focus !== focusTone) mp = { set: null, target: 0, picked: null, started: false, right: 0, total: 0, results: false, focus: focusTone };
  const s = mp;
  const t = toneData();
  if (s.results) {
    return `<div class="empty"><h1>Round complete</h1><p class="score">${s.right} / ${s.total}</p>
      <section class="panel left">${toneAccuracy(t.stats, t.weakest)}</section>
      <div class="row center"><button class="btn ghost" data-act="mp-restart">Another round</button></div><a href="#tones" class="link small">Back to tones</a></div>`;
  }
  const set = s.set;
  return `<div class="spread"><h1>Minimal pairs</h1><span class="muted small num">${s.right}/${s.total} · of ${ROUND_PAIRS}</span></div>
  ${s.focus ? `<p class="callout">Focus: <b>${TONE_SHORT[s.focus]} tone</b></p>` : ""}
  <section class="panel stage">${!s.started ? `<button class="btn primary big" data-act="mp-start">▶ Start listening</button>` : `<button class="play huge" data-act="mp-play" aria-label="Play again">▶</button><p class="muted">Which one did you hear?</p>`}</section>
  ${s.started && set
    ? `<div class="pair-grid">${set.options.map((o, i) => {
        const right = s.picked !== null && i === s.target;
        const wrong = s.picked === i && i !== s.target;
        return `<div class="pair ${right ? "right" : ""} ${wrong ? "wrong" : ""}"><button data-act="mp-pick" data-i="${i}" ${s.picked !== null ? "disabled" : ""}><span class="han hanzi-sm" lang="zh-TW">${esc(o.text)}</span>${reading(toToneMarks(o.pinyinNum), toZhuyin(o.pinyinNum), "center small")}<span class="muted small block">${esc(o.english)}</span></button>${s.picked !== null ? `<button class="compare" data-act="mp-compare" data-i="${i}">Compare ▶</button>` : ""}</div>`;
      }).join("")}</div>`
    : ""}
  ${s.picked !== null && set
    ? `<p class="center ${s.picked === s.target ? "ok" : "bad"}">${s.picked === s.target ? "✓ Correct!" : `✗ It was ${esc(set.options[s.target].text)} (${toToneMarks(set.options[s.target].pinyinNum)})`}</p>
       <button class="btn dark wide" data-act="mp-next">${s.total >= ROUND_PAIRS ? "See results" : "Next →"}</button>`
    : ""}`;
}

function mpPlay(i?: number) {
  if (!mp?.set) return;
  const o = mp.set.options[i ?? mp.target];
  void speak(o.text, { pinyinNum: o.pinyinNum });
}

// --- Shadowing ------------------------------------------------------------------

let sh: { list: VocabEntry[]; i: number; blob: Blob | null; pitch: PitchPoint[] | null; showText: boolean; count: number; analyzing: boolean } | null = null;
let blobUrl: string | null = null;

function shadowList(): VocabEntry[] {
  const known = Object.entries(P.cards)
    .sort((a, b) => b[1][5] - a[1][5])
    .slice(0, 15)
    .map(([h]) => BY_HANZI.get(h)!)
    .filter(Boolean);
  const ids = new Set(known.map((w) => w.hanzi));
  const start = Math.max(0, LEVEL_IDS.indexOf(P.level as never));
  const upcoming = VOCAB.filter((w) => !ids.has(w.hanzi) && LEVEL_IDS.indexOf(w.level as never) >= start).sort((a, b) => a.rank - b.rank);
  return [...known, ...upcoming].slice(0, 25);
}

function viewShadow() {
  if (!sh) sh = { list: shadowList(), i: 0, blob: null, pitch: null, showText: true, count: 0, analyzing: false };
  const s = sh;
  const w = s.list[s.i % s.list.length];
  return `<div class="spread"><h1>Shadowing</h1><span class="muted small">${s.count} done</span></div>
  <p class="muted small">Listen → record → compare → rate</p>
  <article class="panel">
    ${s.showText ? `<p class="han shadow-zh" lang="zh-TW">${esc(w.exZh)}</p>${reading(w.exPinyin, w.exZhuyin)}<p class="muted">${esc(w.exEn)}</p>` : '<p class="muted center pad">Text hidden. Shadow by ear.</p>'}
    <div class="row"><button class="btn primary" data-act="sh-listen">▶ Listen</button><button class="btn ghost" data-act="sh-slow">Slow</button><button class="btn ghost push" data-act="sh-text">${s.showText ? "Hide text" : "Show text"}</button></div>
  </article>
  <section class="panel">
    <label class="btn dark wide file-btn" for="sh-file">🎙️ ${s.blob ? "Record again" : "Record yourself"}</label>
    <input id="sh-file" type="file" accept="audio/*" capture="user" hidden>
    <p class="muted small center">On a phone this opens your voice recorder. Record the sentence, then tap Done to bring it back here.</p>
    ${s.analyzing ? '<p class="muted small center">Analysing your pitch…</p>' : ""}
    ${s.blob
      ? `<div class="three"><button class="btn ghost sm" data-act="sh-listen">▶ Model</button><button class="btn ghost sm" data-act="sh-mine">🎧 Mine</button><button class="btn ghost sm" data-act="sh-both">Both</button></div>${s.pitch ? pitchChart(s.pitch, tonesOf(w.exPinyinNum)) : ""}`
      : ""}
  </section>
  <p class="label">How close was your version?</p>
  <div class="ratings">${["Needs work", "Getting there", "Good", "Nailed it"].map((l, i) => `<button class="rate r${i + 1}" data-act="sh-rate" data-r="${i + 1}">${l}</button>`).join("")}</div>`;
}

function playMine(): Promise<void> {
  return new Promise((resolve) => {
    if (!sh?.blob) return resolve();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(sh.blob);
    const a = new Audio(blobUrl);
    a.onended = () => resolve();
    a.onerror = () => resolve();
    void a.play().catch(() => resolve());
  });
}

function pitchChart(points: PitchPoint[], tones: Tone[]) {
  const voiced = points.filter((p) => p.hz != null) as { t: number; hz: number }[];
  if (voiced.length < 5) return '<p class="muted small">Couldn\'t detect a clear pitch. Try recording a little louder and closer to the mic.</p>';
  const W = 320, H = 140, L = 8, R = 8, T = 10, B = 18;
  const sorted = voiced.map((p) => p.hz).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const t0 = voiced[0].t, t1 = voiced[voiced.length - 1].t, span = Math.max(0.2, t1 - t0);
  const x = (t: number) => L + ((t - t0) / span) * (W - L - R);
  const y = (st: number) => T + ((8 - Math.max(-8, Math.min(8, st))) / 16) * (H - T - B);
  const segs: string[] = [];
  let cur: string[] = [];
  for (const p of points) {
    if (p.t < t0 || p.t > t1) continue;
    if (p.hz == null) {
      if (cur.length > 1) segs.push(cur.join(" "));
      cur = [];
    } else cur.push(`${x(p.t).toFixed(1)},${y(12 * Math.log2(p.hz / median)).toFixed(1)}`);
  }
  if (cur.length > 1) segs.push(cur.join(" "));
  const slot = span / tones.length;
  const targets = contourFor(tones)
    .map((pts, i) => {
      const sx = t0 + slot * i + slot * 0.1, ex = t0 + slot * (i + 1) - slot * 0.1;
      const c = pts.map((v, k) => `${x(sx + ((ex - sx) * k) / (pts.length - 1 || 1))},${y((v - 3) * 3)}`).join(" ");
      return `<polyline points="${c}" fill="none" stroke="var(--s1)" stroke-opacity=".35" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"><title>Syllable ${i + 1}: ${TONE_SHORT[tones[i]]} tone</title></polyline><text x="${x((sx + ex) / 2)}" y="${H - 4}" text-anchor="middle" font-size="10" fill="var(--muted)">${tones[i] === 5 ? "·" : tones[i]}</text>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Your pitch compared with the target tone shapes"><line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)" stroke-dasharray="3 3"/>${targets}${segs.map((s) => `<polyline points="${s}" fill="none" stroke="var(--s2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join("")}</svg>
  <div class="legend"><span><i style="background:var(--s1);opacity:.4"></i>Target tone shapes</span><span><i style="background:var(--s2);height:2px"></i>Your pitch</span></div>`;
}

// --- Words ------------------------------------------------------------------------

let wv = { level: "", cat: "all", q: "", open: "" };

function viewWords() {
  if (!wv.level) wv.level = P.level;
  const needle = wv.q.trim().toLowerCase();
  const list = VOCAB.filter((w) => {
    if (needle) {
      const plain = w.pinyin.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['\s]/g, "");
      return w.hanzi.includes(needle) || w.english.toLowerCase().includes(needle) || plain.includes(needle.replace(/\s/g, "")) || w.zhuyin.includes(needle);
    }
    return (wv.level === "all" || w.level === wv.level) && (wv.cat === "all" || w.category === wv.cat);
  });
  const status = (h: string) => {
    const c = P.cards[h];
    return !c ? "new" : isLearned({ intervalDays: c[1], reps: c[2] }) ? "learned" : "learning";
  };
  const learnedTotal = VOCAB.filter((w) => status(w.hanzi) === "learned").length;
  return `<div class="spread"><h1>Words</h1><span class="muted small">${learnedTotal} / ${VOCAB.length} learned</span></div>
  <input id="w-search" type="search" class="input" placeholder="Search 字, pinyin (xuesheng), ㄅㄆㄇ or English" value="${esc(wv.q)}" aria-label="Search words">
  ${needle ? "" : `<div class="chips">${LEVELS.map((l) => {
      const all = VOCAB.filter((w) => w.level === l.id);
      return `<button class="chip ${wv.level === l.id ? "on" : ""}" data-act="w-level" data-v="${l.id}">${l.name} <span class="muted">${all.filter((w) => status(w.hanzi) === "learned").length}/${all.length}</span></button>`;
    }).join("")}<button class="chip ${wv.level === "all" ? "on" : ""}" data-act="w-level" data-v="all">All levels</button></div>
  <div class="chips"><button class="chip ${wv.cat === "all" ? "on" : ""}" data-act="w-cat" data-v="all">All topics</button>${CATEGORIES.map((c) => `<button class="chip ${wv.cat === c.id ? "on" : ""}" data-act="w-cat" data-v="${c.id}">${c.name}</button>`).join("")}</div>`}
  <ul class="words panel flush">${list.map((w) => `<li>
      <div class="word-row"><button class="play sm" data-act="say" data-text="${esc(w.hanzi)}" data-py="${esc(w.pinyinNum)}" aria-label="Play ${esc(w.hanzi)}">▶</button>
      <button class="word-main" data-act="w-open" data-v="${esc(w.hanzi)}" aria-expanded="${wv.open === w.hanzi}"><span class="han word-zh" lang="zh-TW">${esc(w.hanzi)}</span><span class="grow">${reading(w.pinyin, w.zhuyin, "small")}<span class="block trunc">${esc(w.english)}</span></span><span class="dot ${status(w.hanzi)}" title="${status(w.hanzi)}"></span></button></div>
      ${wv.open === w.hanzi ? `<div class="word-open"><p class="center"><span class="badge">${CAT(w.category)?.name}</span> <span class="badge level">TOCFL ${LEVEL_NAME(w.level)}</span></p>${wordDetails(w)}</div>` : ""}
    </li>`).join("") || '<li class="muted center pad">No words match.</li>'}</ul>`;
}

// --- Options ------------------------------------------------------------------------

let confirmReset = false;

function viewOptions() {
  return `<h1>Options</h1>
  <section class="panel form">
    <h2 class="label">Display</h2>
    <label class="opt"><span>Show pinyin</span><input id="o-py" type="checkbox" ${P.showPinyin ? "checked" : ""}></label>
    <label class="opt"><span>Show Zhuyin <span class="muted" lang="zh-TW">(ㄅㄆㄇㄈ)</span></span><input id="o-zy" type="checkbox" ${P.showZhuyin ? "checked" : ""}></label>
  </section>
  <section class="panel form">
    <h2 class="label">Study</h2>
    <label class="opt"><span>TOCFL level to study</span><select id="o-level">${LEVELS.map((l) => `<option value="${l.id}" ${P.level === l.id ? "selected" : ""}>${l.name} (${l.band})</option>`).join("")}</select></label>
    <label class="opt"><span>New cards from</span><select id="o-deck"><option value="all">All topics</option>${CATEGORIES.map((c) => `<option value="${c.id}" ${P.deck === c.id ? "selected" : ""}>${c.name}</option>`).join("")}</select></label>
    <label class="opt"><span>New cards per day</span><input id="o-new" type="number" min="0" max="50" value="${P.newPerDay}" class="num-input"></label>
    <p class="muted small">Time zone: ${esc(P.timezone)}, used for streaks and "today".</p>
  </section>
  <section class="panel form">
    <h2 class="label">Audio</h2>
    <div id="voice-note"></div>
    <label class="opt"><span>Voice</span><select id="o-voice"><option value="">Loading voices…</option></select></label>
    <label class="opt"><span>Speech speed</span><input id="o-rate" type="range" min="0.5" max="1.2" step="0.05" value="${getRate()}"></label>
    <div class="row"><button class="btn ghost sm" data-act="say" data-text="你好，歡迎來台灣！" data-py="ni3hao3 huan1ying2 lai2 Tai2wan1">▶ Test voice</button></div>
    <p class="muted small">Synthesized tone contours, used when no Chinese voice is installed:</p>
    <div class="row">${([1, 2, 3, 4] as Tone[]).map((t) => `<button class="chip" data-act="tone-demo" data-t="${t}">${toneShape(t, 20)} Tone ${t}</button>`).join("")}</div>
    <details class="small"><summary>How to install a Taiwan Mandarin voice</summary><ul class="list">
      <li><b>iPhone/iPad:</b> Settings → Accessibility → Spoken Content → Voices → Chinese (Taiwan) → Mei-Jia.</li>
      <li><b>macOS:</b> System Settings → Accessibility → Spoken Content → System voice → Manage Voices → Chinese (Taiwan).</li>
      <li><b>Android:</b> Settings → Text-to-speech → Google → Install voice data → 中文 (台灣).</li>
      <li><b>Windows:</b> Settings → Time &amp; language → Speech → Add voices → Chinese (Traditional, Taiwan).</li></ul><p>Reload this page after installing.</p></details>
  </section>
  <section class="panel form">
    <h2 class="label">Your data</h2>
    <p class="small">${syncState === "account" ? "Your progress is saved privately to your Claude account, so it follows you across devices." : "Your progress is saved in this browser only."}</p>
    ${confirmReset
      ? `<p class="small bad">This erases all your cards, tone history and streaks.</p><div class="row"><button class="btn danger sm" data-act="reset-yes">Erase everything</button><button class="btn ghost sm" data-act="reset-no">Keep my progress</button></div>`
      : `<button class="btn ghost sm" data-act="reset">Reset progress…</button>`}
  </section>`;
}

async function fillVoiceUI() {
  const note = document.getElementById("voice-note");
  const { voice, kind } = await pickVoice();
  if (note) {
    note.innerHTML =
      kind === "zh-TW"
        ? `<p class="note good">✓ Taiwan Mandarin voice: ${esc(voice!.name)}</p>`
        : kind === "zh-other"
          ? `<p class="note warn">Using ${esc(voice!.name)}, which isn't a Taiwan voice. Install a zh-TW voice for Taiwan pronunciation (see Options).</p>`
          : `<p class="note warn">No Chinese voice found on this device, so audio plays <b>synthesized tone contours</b> instead of speech. Install a Chinese (Taiwan) voice for real pronunciation (see Options).</p>`;
  }
  const sel = document.getElementById("o-voice") as HTMLSelectElement | null;
  if (sel) {
    const voices = chineseVoices(await loadVoices());
    sel.innerHTML = voices.length
      ? voices.map((v) => `<option value="${esc(v.voiceURI)}" ${voice?.voiceURI === v.voiceURI ? "selected" : ""}>${esc(v.name)} (${esc(v.lang)})</option>`).join("")
      : '<option value="">No Chinese voices installed</option>';
  }
}

// ---------------------------------------------------------------------------
// Router, render & events
// ---------------------------------------------------------------------------

function render() {
  view = currentView();
  const html =
    view === "review" ? viewReview()
    : view === "tones" ? viewTones()
    : view === "identify" ? viewIdentify()
    : view === "pairs" ? viewPairs()
    : view === "shadow" ? viewShadow()
    : view === "words" ? viewWords()
    : view === "options" ? viewOptions()
    : viewToday();
  main().innerHTML = html;
  document.querySelectorAll<HTMLAnchorElement>("nav a").forEach((a) => {
    const v = a.getAttribute("href")!.slice(1);
    const active = v === view || (v === "tones" && ["identify", "pairs", "shadow"].includes(view));
    a.classList.toggle("active", active);
    if (active) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.getElementById("t-py")!.setAttribute("aria-pressed", String(P.showPinyin));
  document.getElementById("t-zy")!.setAttribute("aria-pressed", String(P.showZhuyin));
  if (view === "tones" || view === "options") void fillVoiceUI();
  if (view === "words") {
    const s = document.getElementById("w-search") as HTMLInputElement | null;
    if (s && wv.q) {
      s.focus();
      s.setSelectionRange(s.value.length, s.value.length);
    }
  }
}

function onHashChange() {
  const prev = view;
  const next = currentView();
  if (next === "review" && prev !== "review") rq = null; // fresh queue each visit
  if (next === "shadow" && prev !== "shadow") sh = null;
  window.scrollTo(0, 0);
  render();
}

function onClick(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!el) return;
  const act = el.dataset.act!;
  const d = el.dataset;
  switch (act) {
    case "say": void speak(d.text!, { pinyinNum: d.py }); break;
    case "say-slow": void speak(d.text!, { pinyinNum: d.py, rate: 0.6 }); break;
    case "contour": void playContourFor(d.py!); break;
    case "tone-demo": void playTones([Number(d.t) as Tone]); break;
    case "toggle-py": P.showPinyin = !P.showPinyin; save(); render(); break;
    case "toggle-zy": P.showZhuyin = !P.showZhuyin; save(); render(); break;
    case "reveal": reviewReveal(); break;
    case "rate": reviewRate(Number(d.r) as Rating); break;
    case "id-start":
      if (ti) { ti.started = true; ti.item = nextToneItem(ti.focus); render(); idPlay(); }
      break;
    case "id-play": idPlay(); break;
    case "id-answer":
      if (ti?.item && !ti.answer) {
        const t = Number(d.t) as Tone;
        ti.answer = t;
        ti.total++;
        if (t === ti.item.tone) ti.right++;
        recordTone(ti.item.tone, t);
        render();
      }
      break;
    case "id-next":
      if (!ti) break;
      if (ti.total >= ROUND_ID) ti.results = true;
      else { ti.item = nextToneItem(ti.focus, ti.item); ti.answer = null; idPlay(); }
      render();
      break;
    case "id-restart": {
      const f = d.focus ? Number(d.focus) as Tone : null;
      ti = null;
      go(f ? `identify-${f}` : "identify");
      break;
    }
    case "mp-start":
      if (mp) { const n = nextPair(mp.focus); mp.set = n.set; mp.target = n.target; mp.started = true; render(); mpPlay(); }
      break;
    case "mp-play": mpPlay(); break;
    case "mp-compare": mpPlay(Number(d.i)); break;
    case "mp-pick":
      if (mp?.set && mp.picked === null) {
        const i = Number(d.i);
        mp.picked = i;
        mp.total++;
        if (i === mp.target) mp.right++;
        recordTone(toneAt(mp.set, mp.target), toneAt(mp.set, i));
        render();
      }
      break;
    case "mp-next":
      if (!mp) break;
      if (mp.total >= ROUND_PAIRS) mp.results = true;
      else { const n = nextPair(mp.focus, mp.set); mp.set = n.set; mp.target = n.target; mp.picked = null; mpPlay(); }
      render();
      break;
    case "mp-restart": mp = null; render(); break;
    case "sh-listen": if (sh) { const w = sh.list[sh.i % sh.list.length]; void speak(w.exZh, { pinyinNum: w.exPinyinNum }); } break;
    case "sh-slow": if (sh) { const w = sh.list[sh.i % sh.list.length]; void speak(w.exZh, { pinyinNum: w.exPinyinNum, rate: 0.6 }); } break;
    case "sh-text": if (sh) { sh.showText = !sh.showText; render(); } break;
    case "sh-mine": void playMine(); break;
    case "sh-both":
      if (sh) { const w = sh.list[sh.i % sh.list.length]; void speak(w.exZh, { pinyinNum: w.exPinyinNum }).then(playMine); }
      break;
    case "sh-rate":
      if (sh) { sh.count++; sh.i++; sh.blob = null; sh.pitch = null; recordActivity({ shadowing: 1 }); render(); }
      break;
    case "w-level": wv.level = d.v!; render(); break;
    case "w-cat": wv.cat = d.v!; render(); break;
    case "w-open": wv.open = wv.open === d.v ? "" : d.v!; render(); break;
    case "reset": confirmReset = true; render(); break;
    case "reset-no": confirmReset = false; render(); break;
    case "reset-yes": {
      const keep = { showPinyin: P.showPinyin, showZhuyin: P.showZhuyin, timezone: P.timezone };
      P = { ...defaultProgress(), ...keep };
      confirmReset = false;
      rq = null;
      save();
      go("today");
      break;
    }
  }
}

function onChange(e: Event) {
  const el = e.target as HTMLInputElement;
  switch (el.id) {
    case "o-py": P.showPinyin = el.checked; save(); render(); break;
    case "o-zy": P.showZhuyin = el.checked; save(); render(); break;
    case "o-level": P.level = el.value; rq = null; save(); break;
    case "o-deck": P.deck = el.value; rq = null; save(); break;
    case "o-new": P.newPerDay = Math.max(0, Math.min(50, Math.round(Number(el.value) || 0))); el.value = String(P.newPerDay); rq = null; save(); break;
    case "o-voice": setPreferredVoice(el.value || null); break;
    case "o-rate": setRate(Number(el.value)); break;
    case "sh-file": void loadRecording(el); break;
  }
}

async function loadRecording(input: HTMLInputElement) {
  const f = input.files?.[0];
  if (!f || !sh) return;
  sh.blob = f;
  sh.pitch = null;
  sh.analyzing = true;
  render();
  try {
    sh.pitch = await pitchFromBlob(f);
  } catch {
    sh.pitch = [];
  }
  sh.analyzing = false;
  render();
}

function onInput(e: Event) {
  if ((e as InputEvent).isComposing) return; // wait for the IME to finish a character
  const el = e.target as HTMLInputElement;
  if (el.id === "w-search") {
    wv.q = el.value;
    render();
  }
}

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (view === "review" && rq) {
    const card = rq.queue[rq.pos];
    if (!card) return;
    const shown = rq.revealed || card.isNew;
    if (e.key === " " && !shown) { e.preventDefault(); reviewReveal(); }
    else if (shown && ["1", "2", "3", "4"].includes(e.key)) reviewRate(Number(e.key) as Rating);
  } else if (view === "identify" && ti?.started) {
    if (["1", "2", "3", "4", "5"].includes(e.key) && !ti.answer) (document.querySelector(`[data-act="id-answer"][data-t="${e.key}"]`) as HTMLElement | null)?.click();
    else if (e.key === "Enter" && ti.answer) (document.querySelector('[data-act="id-next"]') as HTMLElement | null)?.click();
  }
}

function start() {
  const local = loadLocal();
  if (local) P = local;
  // keep the time zone in sync with this device
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (deviceTz && deviceTz !== P.timezone) P.timezone = deviceTz;
  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);
  document.addEventListener("input", onInput);
  document.addEventListener("compositionend", onInput);
  document.addEventListener("keydown", onKey);
  window.addEventListener("hashchange", onHashChange);
  setSync("loading");
  render();
  void initStorage();
}

start();
