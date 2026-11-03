import Link from "next/link";
import { getSessionUser } from "@/lib/server/auth";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { WaitlistForm } from "@/components/WaitlistForm";
import { PhoneShot } from "@/components/PhoneShot";

const FEATURES = [
  { icon: "🗂️", title: "Flashcards that schedule themselves", body: "SM-2 spaced repetition with Again / Hard / Good / Easy. 10 new words a day and a clear review queue." },
  { icon: "🎵", title: "Tone training", body: "Tone ID and minimal pairs (媽麻馬罵). The app tracks accuracy per tone and re-drills your weakest one." },
  { icon: "🎙️", title: "Shadowing with a pitch graph", body: "Listen, record yourself, play both back, and see your pitch over the target tone shapes." },
  { icon: "📈", title: "A 20-minute daily plan", body: "Streaks, words learned, tone accuracy, a 30-day activity chart, and today's session laid out for you." },
];

const AUDIENCE = [
  { emoji: "🎓", title: "Students heading to Taiwan", body: "University or language-center programs: campus vocabulary, TOCFL levels from Novice up." },
  { emoji: "💼", title: "Professionals & engineers", body: "Moving for work in tech? Includes IT and cybersecurity terms as Taiwan uses them: 軟體, 資安, 伺服器." },
  { emoji: "🧳", title: "Newcomers & long stays", body: "The MRT, night markets, bento shops, EasyCards: the Mandarin you need in your first week." },
];

const DIFFERENCES = [
  ["Characters", "Traditional (繁體)", "Simplified (简体)"],
  ["Phonetics", "Zhuyin ㄅㄆㄇ + pinyin", "Pinyin only"],
  ["Metro", "捷運 jiéyùn", "地铁 dìtiě"],
  ["Software", "軟體 ruǎntǐ", "软件 ruǎnjiàn"],
  ["Trash", "垃圾 lèsè", "垃圾 lājī"],
  ["Week", "星期 xīngqí", "星期 xīngqī"],
];

export default async function Landing() {
  const user = await getSessionUser();
  return (
    <div className="min-h-dvh">
      <SiteHeader signedIn={!!user} />
      <main>
        <section className="mx-auto grid max-w-5xl items-center gap-10 px-4 pb-14 pt-10 md:grid-cols-[1.2fr_1fr] md:pt-16">
          <div className="space-y-5">
            <p className="inline-block rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">For people learning Mandarin for Taiwan</p>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Learn the Mandarin they <span className="text-accent">actually speak</span> in Taiwan.
            </h1>
            <p className="text-lg text-ink-2">
              Traditional characters, Zhuyin and pinyin, Taiwan pronunciation and vocabulary, organized by TOCFL level.
              A 20-minute daily tutor for flashcards, tones and speaking.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={user ? "/dashboard" : "/login"} className="rounded-xl bg-accent px-5 py-3 font-semibold text-accent-ink shadow-sm">
                {user ? "Open the app" : "Start learning free"}
              </Link>
              <a href="#waitlist" className="rounded-xl border border-line bg-card px-5 py-3 font-semibold">Join the waitlist</a>
            </div>
            <p className="text-sm text-muted">Free while in beta · Works in your phone&apos;s browser · No install</p>
          </div>
          <div className="flex justify-center">
            <PhoneShot src="/screenshots/dashboard.png" alt="Dashboard with streak, words learned, cards due and a 20-minute plan" priority />
          </div>
        </section>

        <section className="border-y border-line bg-card/60">
          <div className="mx-auto max-w-5xl px-4 py-14">
            <h2 className="text-2xl font-bold">Who it&apos;s for</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {AUDIENCE.map((a) => (
                <div key={a.title} className="rounded-2xl border border-line bg-paper p-5">
                  <p className="text-3xl">{a.emoji}</p>
                  <h3 className="mt-2 font-semibold">{a.title}</h3>
                  <p className="mt-1 text-sm text-ink-2">{a.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-14">
          <h2 className="text-2xl font-bold">What it does</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4 rounded-2xl border border-line bg-card p-5">
                <span className="text-2xl" aria-hidden>{f.icon}</span>
                <div>
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-1 text-sm text-ink-2">{f.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="-mx-4 mt-10 flex snap-x gap-6 overflow-x-auto px-4 pb-4" aria-label="Screenshots">
            <PhoneShot src="/screenshots/review.png" alt="Flashcard for 點 with pinyin, Zhuyin, example sentence and rating buttons" caption="Flashcards with pinyin + Zhuyin" />
            <PhoneShot src="/screenshots/toneid.png" alt="Tone identification exercise showing five tone buttons" caption="Tone ID drills" />
            <PhoneShot src="/screenshots/shadow.png" alt="Shadowing exercise with a pitch graph" caption="Shadowing with pitch graph" />
            <PhoneShot src="/screenshots/tones.png" alt="Accuracy by tone with weakest tone highlighted" caption="Find your weakest tone" />
          </div>
        </section>

        <section className="border-y border-line bg-card/60">
          <div className="mx-auto grid max-w-5xl gap-8 px-4 py-14 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold">Built for Taiwan, not adapted from Beijing</h2>
              <p className="mt-3 text-ink-2">
                Most apps teach mainland Mandarin. Then you land in Taipei and the signs, the MRT and the menus look different.
                Here everything is Taiwan-standard from day one.
              </p>
            </div>
            <table className="w-full overflow-hidden rounded-2xl border border-line bg-paper text-sm">
              <thead>
                <tr className="text-left">
                  <th className="p-3" />
                  <th className="p-3 text-accent">This app</th>
                  <th className="p-3 text-muted">Typical apps</th>
                </tr>
              </thead>
              <tbody lang="zh-TW">
                {DIFFERENCES.map(([k, a, b]) => (
                  <tr key={k} className="border-t border-line">
                    <td className="p-3 text-ink-2" lang="en">{k}</td>
                    <td className="han p-3 font-medium">{a}</td>
                    <td className="han p-3 text-muted">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="waitlist" className="mx-auto max-w-2xl scroll-mt-20 px-4 py-16 text-center">
          <h2 className="text-2xl font-bold">Get early access to what&apos;s next</h2>
          <p className="mt-2 text-ink-2">Full TOCFL word lists, pronunciation scoring and mock tests are on the way. Join the waitlist to hear first.</p>
          <div className="mx-auto mt-6 max-w-lg">
            <WaitlistForm source="landing" />
          </div>
          <p className="mt-4 text-sm text-muted">
            Or <Link href={user ? "/dashboard" : "/login"} className="text-accent underline">start using it free today</Link> · <Link href="/pricing" className="underline">see pricing</Link>
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
