"use client";
/**
 * Synthesized pitch contours (Web Audio API). Used as the fallback when the
 * device has no Chinese speech voice, and on demand to hear a tone's shape.
 *
 * Chao tone letters (1 = lowest, 5 = highest) are mapped onto a speaking
 * range of one octave. Tone 1 = 55, 2 = 35, 3 = 214, 4 = 51.
 */
import { contourFor, tonesOf, type Tone } from "../pinyin";

let ctx: AudioContext | null = null;
export function audioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

const LOW_HZ = 110; // Chao level 1
const HIGH_HZ = 220; // Chao level 5

export function chaoToHz(level: number): number {
  return LOW_HZ * Math.pow(HIGH_HZ / LOW_HZ, (level - 1) / 4);
}

function durationFor(points: number[], tone: Tone, isLast: boolean): number {
  if (tone === 5) return 0.18;
  if (points.length === 3) return 0.62; // full 214
  if (tone === 4) return 0.32;
  return isLast ? 0.45 : 0.32;
}

/**
 * Play a sequence of tones as a hummed voice-like contour. Resolves when done.
 * Applies 3-3 sandhi, half-third and neutral-tone pitch rules.
 */
export function playTones(tones: Tone[], opts: { gap?: number } = {}): Promise<void> {
  const ac = audioContext();
  const gap = opts.gap ?? 0.06;
  const targets = contourFor(tones);
  let t = ac.currentTime + 0.05;

  const out = ac.createGain();
  out.gain.value = 0.9;
  // two formant-ish band-pass filters give a vowel-like "ah" timbre
  const f1 = ac.createBiquadFilter();
  f1.type = "bandpass";
  f1.frequency.value = 750;
  f1.Q.value = 3;
  const f2 = ac.createBiquadFilter();
  f2.type = "bandpass";
  f2.frequency.value = 1200;
  f2.Q.value = 4;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2500;
  f1.connect(out);
  f2.connect(out);
  out.connect(ac.destination);

  let end = t;
  targets.forEach((points, i) => {
    const dur = durationFor(points, tones[i], i === targets.length - 1);
    const osc = ac.createOscillator();
    osc.type = "sawtooth";
    const env = ac.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.35, t + 0.03);
    env.gain.setValueAtTime(0.35, t + dur - 0.05);
    env.gain.linearRampToValueAtTime(0, t + dur);
    osc.frequency.setValueAtTime(chaoToHz(points[0]), t);
    const step = dur / (points.length - 1);
    points.slice(1).forEach((p, k) => {
      osc.frequency.linearRampToValueAtTime(chaoToHz(p), t + step * (k + 1));
    });
    osc.connect(lp);
    lp.connect(env);
    env.connect(f1);
    env.connect(f2);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    t += dur + gap;
    end = t;
  });
  return new Promise((resolve) => setTimeout(resolve, (end - ac.currentTime) * 1000 + 50));
}

export function playContourFor(pinyinNum: string): Promise<void> {
  return playTones(tonesOf(pinyinNum));
}
