"use client";
import { useEffect, useState } from "react";
import { CATEGORIES, LEVELS } from "@/data/vocab";
import { usePrefs } from "@/components/Prefs";
import { VoiceStatus } from "@/components/VoiceStatus";
import { chineseVoices, getRate, loadVoices, setPreferredVoice, setRate, speak, pickVoice } from "@/lib/audio/speech";
import { playTones } from "@/lib/audio/contour";
import { ToneShape } from "@/components/ToneShape";
import type { Tone } from "@/lib/pinyin";

interface Settings {
  newPerDay: number;
  level: string;
  deck: string;
  timezone: string;
}

export function SettingsForm({ initial, email }: { initial: Settings; email: string }) {
  const { prefs, setPrefs } = usePrefs();
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string>("");
  const [rate, setRateState] = useState(0.85);

  useEffect(() => {
    void loadVoices().then((v) => {
      setVoices(chineseVoices(v));
      setRateState(getRate());
    });
    void pickVoice().then(({ voice }) => setVoiceURI(voice?.voiceURI ?? ""));
  }, []);

  async function save(patch: Partial<Settings>) {
    setS((cur) => ({ ...cur, ...patch }));
    const res = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
    setSaved(res.ok);
    setTimeout(() => setSaved(false), 1500);
  }

  const row = "flex items-center justify-between gap-3 py-3";
  const select = "rounded-lg border border-line bg-card px-2 py-1.5";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        {saved && <span className="text-sm text-jade" role="status">Saved ✓</span>}
      </div>

      <section className="rounded-2xl border border-line bg-card px-4">
        <h2 className="pt-4 text-sm font-semibold uppercase tracking-wide text-muted">Display</h2>
        <label className={row}>
          <span>Show pinyin</span>
          <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={prefs.showPinyin} onChange={(e) => setPrefs({ showPinyin: e.target.checked })} />
        </label>
        <label className={row}>
          <span>
            Show Zhuyin <span className="zhuyin text-muted">(ㄅㄆㄇㄈ)</span>
          </span>
          <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={prefs.showZhuyin} onChange={(e) => setPrefs({ showZhuyin: e.target.checked })} />
        </label>
      </section>

      <section className="rounded-2xl border border-line bg-card px-4">
        <h2 className="pt-4 text-sm font-semibold uppercase tracking-wide text-muted">Study</h2>
        <label className={row}>
          <span>TOCFL level to study</span>
          <select className={select} value={s.level} onChange={(e) => void save({ level: e.target.value })}>
            {LEVELS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.band})
              </option>
            ))}
          </select>
        </label>
        <label className={row}>
          <span>New cards from</span>
          <select className={select} value={s.deck} onChange={(e) => void save({ deck: e.target.value })}>
            <option value="all">All topics</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={row}>
          <span>New cards per day</span>
          <input
            type="number"
            min={0}
            max={50}
            className={`${select} w-20 text-right`}
            value={s.newPerDay}
            onChange={(e) => setS({ ...s, newPerDay: Number(e.target.value) })}
            onBlur={() => void save({ newPerDay: Math.max(0, Math.min(50, Math.round(s.newPerDay))) })}
          />
        </label>
        <p className="pb-3 text-xs text-muted">Time zone: {s.timezone} (detected from your browser — used for streaks and “today”).</p>
      </section>

      <section className="space-y-3 rounded-2xl border border-line bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Audio</h2>
        <VoiceStatus />
        {voices.length > 0 && (
          <label className="flex items-center justify-between gap-3">
            <span>Voice</span>
            <select
              className={`${select} max-w-[60%]`}
              value={voiceURI}
              onChange={(e) => {
                setVoiceURI(e.target.value);
                setPreferredVoice(e.target.value);
              }}
            >
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center justify-between gap-3">
          <span>Speech speed</span>
          <input
            type="range"
            min={0.5}
            max={1.2}
            step={0.05}
            value={rate}
            onChange={(e) => {
              setRateState(Number(e.target.value));
              setRate(Number(e.target.value));
            }}
          />
          <span className="w-10 text-right text-sm tabular-nums">{rate.toFixed(2)}×</span>
        </label>
        <button className="rounded-lg border border-line px-3 py-1.5 text-sm" onClick={() => void speak("你好，歡迎來台灣！", { pinyinNum: "ni3hao3 huan1ying2 lai2 Tai2wan1" })}>
          🔊 Test voice
        </button>
        <div>
          <p className="mb-2 text-sm text-ink-2">Synthesized tone contours (the fallback when no Chinese voice is installed):</p>
          <div className="flex flex-wrap gap-2">
            {([1, 2, 3, 4] as Tone[]).map((t) => (
              <button key={t} onClick={() => void playTones([t])} className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-sm">
                <ToneShape tone={t} size={20} /> Tone {t}
              </button>
            ))}
          </div>
        </div>
        <details className="text-sm text-ink-2">
          <summary className="cursor-pointer">How to install a Taiwan Mandarin voice</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><b>iPhone/iPad:</b> Settings → Accessibility → Spoken Content → Voices → Chinese (Taiwan) → Mei-Jia.</li>
            <li><b>macOS:</b> System Settings → Accessibility → Spoken Content → System voice → Manage Voices → Chinese (Taiwan).</li>
            <li><b>Android:</b> Settings → Text-to-speech → Google → Install voice data → 中文 (台灣).</li>
            <li><b>Windows:</b> Settings → Time &amp; language → Speech → Add voices → Chinese (Traditional, Taiwan). Edge also has online zh-TW voices.</li>
          </ul>
          <p className="mt-2">Reload this page after installing.</p>
        </details>
      </section>

      <div className="space-y-2 text-center">
        <p className="text-xs text-muted">Signed in as {email}</p>
        <button
          className="rounded-xl border border-line px-4 py-2 text-sm"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            // full reload on purpose: drop all client state of the signed-out user
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign("/");
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
