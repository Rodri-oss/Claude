import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/server/user";
import { getDashboard } from "@/lib/server/stats";
import { prisma } from "@/lib/server/db";
import { ActivityChart } from "@/components/ActivityChart";
import { ToneAccuracy } from "@/components/ToneAccuracy";
import { TONE_SHORT } from "@/lib/pinyin";
import { LEVELS } from "@/data/vocab";
import { LEARNED_WHERE } from "@/lib/srs";

export const metadata: Metadata = { title: "Today" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const d = await getDashboard(user);
  const levelRows = await prisma.word.groupBy({ by: ["level"], _count: true });
  const learnedByLevel = await prisma.card.findMany({
    where: { userId: user.id, ...LEARNED_WHERE },
    select: { word: { select: { level: true } } },
  });
  const learnedCount = (lvl: string) => learnedByLevel.filter((c) => c.word.level === lvl).length;
  const planMinutes = d.plan.reduce((a, s) => a + s.minutes, 0);
  const planDone = d.plan.filter((s) => s.target > 0 && s.done >= s.target).length;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">{new Date(d.today + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}</p>
        <h1 className="text-2xl font-bold">
          <span lang="zh-TW" className="han">加油！</span> Let&apos;s study.
        </h1>
      </div>

      <section className="grid grid-cols-2 gap-3" aria-label="Summary">
        <Tile testid="streak" label="Day streak" value={`${d.streak}`} unit={d.streak === 1 ? "day" : "days"} icon="🔥" sub={`Longest: ${d.longestStreak}`} />
        <Tile testid="learned" label="Words learned" value={`${d.wordsLearned}`} unit={`/ ${d.totalWords}`} icon="📖" sub={`${d.wordsIntroduced} started`} />
        <Tile testid="due" label="Cards due" value={`${d.dueNow}`} icon="🗂️" sub={d.dueLaterToday ? `+${d.dueLaterToday} later today` : `${d.newAvailable} new available`} href="/review" />
        <Tile testid="minutes" label="Studied today" value={`${d.minutesToday}`} unit="min" icon="⏱️" sub="Goal: 20 min" />
      </section>

      <section className="rounded-2xl border border-line bg-card p-4" data-testid="plan">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">Today&apos;s {planMinutes}-minute session</h2>
          <span className="text-xs text-muted">{planDone}/{d.plan.length} done</span>
        </div>
        <ol className="space-y-2.5">
          {d.plan.map((s, i) => {
            const complete = s.target > 0 && s.done >= s.target;
            const pct = s.target ? Math.min(100, Math.round((s.done / s.target) * 100)) : 0;
            return (
              <li key={s.id} className="flex items-center gap-3">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${complete ? "bg-jade text-white" : "bg-paper text-ink-2 ring-1 ring-line"}`}>
                  {complete ? "✓" : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium">{s.title}</p>
                    <span className="shrink-0 text-xs text-muted tabular-nums">{s.minutes} min</span>
                  </div>
                  <p className="truncate text-xs text-ink-2">{s.detail}{s.target > 0 && ` · ${s.done}/${s.target}`}</p>
                  {s.target > 0 && (
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line/60">
                      <div className="h-full rounded-full bg-jade" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
                <Link href={s.href} className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${complete ? "border border-line text-ink-2" : "bg-accent text-accent-ink"}`}>
                  {complete ? "More" : "Start"}
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-2xl border border-line bg-card p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">Tone accuracy</h2>
          <Link href="/tones" className="text-xs text-accent">Practice →</Link>
        </div>
        <ToneAccuracy stats={d.tones.stats} weakest={d.tones.weakest} />
        {d.tones.weakest && (
          <p className="mt-3 text-sm text-ink-2">
            Weakest: <b>{TONE_SHORT[d.tones.weakest]} tone</b>
            {d.tones.confusedWith && <> (often heard as {TONE_SHORT[d.tones.confusedWith]})</>} —{" "}
            <Link className="text-accent underline" href={`/tones/identify?focus=${d.tones.weakest}`}>re-drill it</Link>
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-semibold">Last 30 days</h2>
          <span className="text-xs text-muted">{d.last30.filter((x) => x.reviews + x.toneDrills + x.shadowing > 0).length} active days</span>
        </div>
        <ActivityChart days={d.last30} />
      </section>

      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="mb-3 font-semibold">TOCFL progress</h2>
        <ul className="space-y-2">
          {LEVELS.map((l) => {
            const total = levelRows.find((r) => r.level === l.id)?._count ?? 0;
            const n = learnedCount(l.id);
            return (
              <li key={l.id} className="flex items-center gap-2 text-sm">
                <span className="w-20 shrink-0">{l.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-line/60">
                  <div className="h-full rounded-full bg-[var(--s1)]" style={{ width: `${total ? (n / total) * 100 : 0}%` }} />
                </div>
                <span className="w-14 shrink-0 text-right text-xs text-ink-2 tabular-nums">{n}/{total}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Tile({ label, value, unit, icon, sub, href, testid }: { label: string; value: string; unit?: string; icon: string; sub?: string; href?: string; testid?: string }) {
  const body = (
    <div className="h-full rounded-2xl border border-line bg-card p-3.5" data-testid={testid}>
      <p className="flex items-center gap-1.5 text-xs text-ink-2"><span aria-hidden>{icon}</span>{label}</p>
      <p className="mt-1 text-3xl font-bold">
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-muted">{unit}</span>}
      </p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
