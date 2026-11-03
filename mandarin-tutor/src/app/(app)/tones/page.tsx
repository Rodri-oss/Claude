import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/server/user";
import { getToneStats } from "@/lib/server/stats";
import { ToneAccuracy } from "@/components/ToneAccuracy";
import { VoiceStatus } from "@/components/VoiceStatus";
import { TONE_SHORT } from "@/lib/pinyin";

export const metadata: Metadata = { title: "Tones" };

export default async function TonesPage() {
  const user = await getCurrentUser();
  const { stats, weakest, confusedWith, total } = await getToneStats(user);
  const exercises = [
    { href: "/tones/identify", title: "Tone ID", zh: "聽聲調", desc: "Hear a syllable, pick tone 1–4 or neutral." },
    { href: "/tones/pairs", title: "Minimal pairs", zh: "媽麻馬罵", desc: "Tell apart words that differ only by tone." },
    { href: "/tones/shadowing", title: "Shadowing", zh: "跟讀", desc: "Listen, record yourself, compare, self-rate." },
  ];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Pronunciation</h1>
      <VoiceStatus compact />
      <section className="rounded-2xl border border-line bg-card p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">Accuracy by tone</h2>
          <span className="text-xs text-muted">last {total} answers</span>
        </div>
        <ToneAccuracy stats={stats} weakest={weakest} />
        {weakest ? (
          <div className="mt-4 rounded-xl bg-accent-soft p-3 text-sm" data-testid="weakest">
            Your weakest tone is the <b>{TONE_SHORT[weakest]}</b>
            {confusedWith && <> — most often heard as {TONE_SHORT[confusedWith]}</>}.
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href={`/tones/identify?focus=${weakest}`} className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-ink">
                Drill {TONE_SHORT[weakest]} tone
              </Link>
              <Link href={`/tones/pairs?focus=${weakest}`} className="rounded-lg border border-accent px-3 py-1.5 font-medium text-accent">
                Minimal pairs
              </Link>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Answer at least 5 items per tone to find your weakest tone.</p>
        )}
      </section>
      <div className="grid gap-3">
        {exercises.map((e) => (
          <Link key={e.href} href={e.href} className="flex items-center gap-4 rounded-2xl border border-line bg-card p-4 shadow-sm active:scale-[0.99]">
            <span lang="zh-TW" className="han w-24 shrink-0 text-center text-2xl text-accent">{e.zh}</span>
            <span>
              <span className="block font-semibold">{e.title}</span>
              <span className="text-sm text-ink-2">{e.desc}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
