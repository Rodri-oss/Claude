"use client";
/**
 * Browser speech synthesis with a Taiwan Mandarin (zh-TW) voice.
 * Falls back to other Chinese voices, then to synthesized tone contours.
 */
import { playContourFor } from "./contour";

export type VoiceKind = "zh-TW" | "zh-other" | "none";

const VOICE_PREF_KEY = "mt.voiceURI";
const RATE_KEY = "mt.rate";

function isTaiwan(v: SpeechSynthesisVoice) {
  const lang = v.lang.toLowerCase().replace("_", "-");
  return lang === "zh-tw" || lang.startsWith("zh-hant") || /taiwan|台灣|國語|mei-?jia|hanhan|yating|zhiwei/i.test(v.name);
}
function isChinese(v: SpeechSynthesisVoice) {
  return v.lang.toLowerCase().replace("_", "-").startsWith("zh") || v.lang.toLowerCase().startsWith("cmn");
}

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

let voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

/** Voices load asynchronously in Chrome; wait for them (with a timeout). */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);
  const now = speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  if (!voicesPromise) {
    voicesPromise = new Promise((resolve) => {
      const done = () => resolve(speechSynthesis.getVoices());
      speechSynthesis.addEventListener("voiceschanged", done, { once: true });
      setTimeout(done, 1500);
    }).then((v) => {
      if (!(v as SpeechSynthesisVoice[]).length) voicesPromise = null; // try again later
      return v as SpeechSynthesisVoice[];
    });
  }
  return voicesPromise;
}

export function chineseVoices(all: SpeechSynthesisVoice[]) {
  return all.filter(isChinese).sort((a, b) => Number(isTaiwan(b)) - Number(isTaiwan(a)));
}

export async function pickVoice(): Promise<{ voice: SpeechSynthesisVoice | null; kind: VoiceKind }> {
  const voices = chineseVoices(await loadVoices());
  let preferred: string | null = null;
  try {
    preferred = localStorage.getItem(VOICE_PREF_KEY);
  } catch {}
  const chosen =
    (preferred && voices.find((v) => v.voiceURI === preferred)) || voices.find(isTaiwan) || voices[0] || null;
  if (!chosen) return { voice: null, kind: "none" };
  return { voice: chosen, kind: isTaiwan(chosen) ? "zh-TW" : "zh-other" };
}

export function setPreferredVoice(uri: string | null) {
  try {
    if (uri) localStorage.setItem(VOICE_PREF_KEY, uri);
    else localStorage.removeItem(VOICE_PREF_KEY);
  } catch {}
}

export function getRate(): number {
  try {
    const r = Number(localStorage.getItem(RATE_KEY));
    return r >= 0.4 && r <= 1.5 ? r : 0.85;
  } catch {
    return 0.85;
  }
}
export function setRate(r: number) {
  try {
    localStorage.setItem(RATE_KEY, String(r));
  } catch {}
}

export interface SpeakOptions {
  rate?: number;
  /** numbered pinyin, used for the contour fallback */
  pinyinNum?: string;
  /** force the synthesized contour even if a voice exists */
  contour?: boolean;
}

/** Speak Chinese text. Resolves with how it was played. */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<VoiceKind | "contour"> {
  if (!opts.contour && speechSupported()) {
    const { voice, kind } = await pickVoice();
    if (voice) {
      await new Promise<void>((resolve) => {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.voice = voice;
        u.lang = voice.lang || "zh-TW";
        u.rate = opts.rate ?? getRate();
        u.onend = () => resolve();
        u.onerror = () => resolve();
        speechSynthesis.speak(u);
        // safety net: some engines never fire onend
        setTimeout(resolve, 1000 + text.length * 600);
      });
      return kind;
    }
  }
  if (opts.pinyinNum) {
    await playContourFor(opts.pinyinNum);
    return "contour";
  }
  return "none";
}

export function stopSpeaking() {
  if (speechSupported()) speechSynthesis.cancel();
}
