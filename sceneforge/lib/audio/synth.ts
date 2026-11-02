/**
 * Tiny deterministic audio synthesizer. Used for:
 *  - the MOCK voice provider (syllabic "babble" whose length follows the text) — clearly not real speech
 *  - original, license-free demo music, ambience and sound effects
 */
import fs from 'node:fs';
import path from 'node:path';

export const SR = 44100;

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}

export function writeWav(file: string, channels: Float32Array[], sampleRate = SR) {
  const n = channels[0].length;
  const ch = channels.length;
  const buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * ch * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * ch * 2, 28);
  buf.writeUInt16LE(ch * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * ch * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      buf.writeInt16LE(Math.round(v * 32767), o);
      o += 2;
    }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

function normalize(x: Float32Array, peak = 0.85) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] = (x[i] / m) * peak;
  return x;
}

const VOWEL_FORMANTS: Record<string, [number, number]> = { a: [800, 1200], e: [500, 1900], i: [320, 2300], o: [500, 900], u: [350, 800], y: [400, 2000] };

/**
 * Mock voice: one tone burst per syllable with vowel-dependent formant colouring and a natural pitch
 * contour. Duration tracks the text (≈ words / wps). This is a placeholder, NOT speech synthesis.
 */
export function babble(text: string, opts: { pitchHz?: number; wps?: number; seed?: number } = {}): Float32Array {
  const pitch = opts.pitchHz ?? 180;
  const wps = opts.wps ?? 2.6;
  const r = rng(opts.seed ?? 1);
  const words = text.split(/\s+/).filter(Boolean);
  const segs: { dur: number; vowel: string; silent: boolean; accent: number }[] = [];
  for (const w of words) {
    const vowels = (w.toLowerCase().match(/[aeiouy]+/g) || ['a']).map((v) => v[0]);
    const wordDur = 1 / wps;
    for (const v of vowels) segs.push({ dur: (wordDur / vowels.length) * (0.75 + r() * 0.4), vowel: v, silent: false, accent: r() });
    segs.push({ dur: /[.!?]$/.test(w) ? 0.28 : /[,;:]$/.test(w) ? 0.14 : 0.04, vowel: 'a', silent: true, accent: 0 });
  }
  const total = Math.ceil((segs.reduce((a, s) => a + s.dur, 0) + 0.15) * SR);
  const out = new Float32Array(total);
  let t0 = Math.floor(0.05 * SR);
  let phase = 0;
  const question = text.trim().endsWith('?');
  segs.forEach((s, idx) => {
    const n = Math.floor(s.dur * SR);
    if (!s.silent) {
      const [f1, f2] = VOWEL_FORMANTS[s.vowel] ?? VOWEL_FORMANTS.a;
      const progress = idx / segs.length;
      const p0 = pitch * (1 + 0.12 * s.accent - 0.1 * progress + (question && progress > 0.8 ? 0.25 : 0));
      for (let i = 0; i < n && t0 + i < total; i++) {
        const env = Math.min(1, i / (0.012 * SR)) * Math.min(1, (n - i) / (0.03 * SR));
        const f = p0 * (1 + 0.02 * Math.sin((2 * Math.PI * 5 * i) / SR));
        phase += (2 * Math.PI * f) / SR;
        let v = 0;
        for (let h = 1; h <= 18; h++) {
          const hf = h * f;
          const w = 1 / (1 + ((hf - f1) / 140) ** 2) + 0.6 / (1 + ((hf - f2) / 200) ** 2) + 0.05 / h;
          v += Math.sin(phase * h) * w;
        }
        out[t0 + i] += v * env * 0.12;
      }
    }
    t0 += n;
  });
  return normalize(out, 0.7);
}

const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12);

export type MusicMood = 'adventurous' | 'calm' | 'tense' | 'playful';

/** Simple original chiptune-orchestral loop: pad chords + bass + arpeggio + soft drums. Stereo. */
export function music(durationSec: number, mood: MusicMood = 'adventurous', seed = 3): Float32Array[] {
  const prog: Record<MusicMood, { bpm: number; chords: number[][]; bright: number }> = {
    adventurous: { bpm: 104, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bright: 1 },
    calm: { bpm: 76, chords: [[48, 52, 55, 59], [45, 48, 52, 55], [41, 45, 48, 52], [43, 47, 50, 53]], bright: 0.5 },
    tense: { bpm: 96, chords: [[50, 53, 57], [50, 53, 56], [46, 50, 53], [49, 52, 56]], bright: 0.7 },
    playful: { bpm: 120, chords: [[60, 64, 67], [57, 60, 64], [62, 65, 69], [55, 59, 62]], bright: 1.2 },
  };
  const P = prog[mood];
  const n = Math.ceil(durationSec * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const beat = 60 / P.bpm;
  const bar = beat * 4;
  const r = rng(seed);
  // pads + bass
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const ci = Math.floor(t / bar) % P.chords.length;
    const chord = P.chords[ci];
    const tb = t % bar;
    const swell = Math.min(1, tb / 0.4) * (0.75 + 0.25 * Math.cos((2 * Math.PI * tb) / bar));
    let pad = 0;
    for (const note of chord) {
      const f = NOTE(note);
      pad += Math.sin(2 * Math.PI * f * t) * 0.5 + Math.sin(2 * Math.PI * f * 1.003 * t) * 0.35 + Math.sin(4 * Math.PI * f * t) * 0.08 * P.bright;
    }
    pad *= 0.07 * swell;
    const bassNote = chord[0] - 12;
    const bt = t % beat;
    const bassEnv = Math.exp(-bt * 3) * 0.9 + 0.1;
    const bass = Math.sin(2 * Math.PI * NOTE(bassNote) * t) * 0.16 * bassEnv;
    L[i] += pad + bass;
    R[i] += pad * 0.95 + bass;
  }
  // arpeggio (8th notes)
  const eighth = beat / 2;
  for (let k = 0; k * eighth < durationSec; k++) {
    const t0 = k * eighth;
    const chord = P.chords[Math.floor(t0 / bar) % P.chords.length];
    const note = chord[(k + Math.floor(r() * 2)) % chord.length] + 12;
    const f = NOTE(note);
    const len = Math.floor(eighth * SR * 0.9);
    const s0 = Math.floor(t0 * SR);
    const pan = 0.5 + 0.3 * Math.sin(k * 0.7);
    for (let i = 0; i < len && s0 + i < n; i++) {
      const tt = i / SR;
      const v = (Math.sin(2 * Math.PI * f * tt) + 0.3 * Math.sin(6 * Math.PI * f * tt)) * Math.exp(-tt * 9) * 0.07 * P.bright;
      L[s0 + i] += v * (1 - pan);
      R[s0 + i] += v * pan;
    }
  }
  // drums: kick on 1 & 3, hat on 8ths
  for (let k = 0; k * eighth < durationSec; k++) {
    const s0 = Math.floor(k * eighth * SR);
    if (k % 4 === 0) {
      for (let i = 0; i < 0.25 * SR && s0 + i < n; i++) {
        const tt = i / SR;
        const v = Math.sin(2 * Math.PI * (50 + 90 * Math.exp(-tt * 30)) * tt) * Math.exp(-tt * 12) * 0.35;
        L[s0 + i] += v;
        R[s0 + i] += v;
      }
    }
    for (let i = 0; i < 0.04 * SR && s0 + i < n; i++) {
      const v = (r() * 2 - 1) * Math.exp(-(i / SR) * 90) * 0.04;
      L[s0 + i] += v;
      R[s0 + i] += v * 0.8;
    }
  }
  // gentle fade at loop boundaries
  const fade = Math.floor(0.05 * SR);
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    L[i] *= g;
    R[i] *= g;
    L[n - 1 - i] *= g;
    R[n - 1 - i] *= g;
  }
  return [normalize(L, 0.8), normalize(R, 0.8)];
}

export type AmbienceKind = 'wind' | 'rain' | 'city' | 'night';

export function ambience(durationSec: number, kind: AmbienceKind, seed = 9): Float32Array[] {
  const n = Math.ceil(durationSec * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const r = rng(seed);
  let bl = 0;
  let br = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const wl = r() * 2 - 1;
    const wr = r() * 2 - 1;
    bl = 0.995 * bl + 0.03 * wl; // brown-ish
    br = 0.995 * br + 0.03 * wr;
    let l = 0;
    let rr = 0;
    if (kind === 'wind') {
      const g = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.11 * t) * Math.sin(2 * Math.PI * 0.037 * t);
      l = bl * 2.5 * g;
      rr = br * 2.5 * g;
    } else if (kind === 'rain') {
      l = wl * 0.08 + bl * 0.8 + (r() < 0.0009 ? (r() * 2 - 1) * 0.5 : 0);
      rr = wr * 0.08 + br * 0.8 + (r() < 0.0009 ? (r() * 2 - 1) * 0.5 : 0);
    } else if (kind === 'city') {
      l = bl * 2 + 0.02 * Math.sin(2 * Math.PI * 110 * t) * (0.5 + 0.5 * Math.sin(t * 0.3));
      rr = br * 2;
    } else {
      l = bl * 0.8;
      rr = br * 0.8;
      const chirp = Math.floor(t * 3.1) % 7 === 0 && t % (1 / 3.1) < 0.05;
      if (chirp) {
        const v = Math.sin(2 * Math.PI * 4200 * t) * 0.08;
        l += v;
        rr += v * 0.6;
      }
    }
    L[i] = l;
    R[i] = rr;
  }
  return [normalize(L, 0.5), normalize(R, 0.5)];
}

export type SfxKind = 'whoosh' | 'impact' | 'chime' | 'pop' | 'steps' | 'thunder';

export function sfx(kind: SfxKind, seed = 5): Float32Array {
  const r = rng(seed);
  const dur = { whoosh: 0.9, impact: 1.0, chime: 1.6, pop: 0.25, steps: 1.6, thunder: 3 }[kind];
  const n = Math.ceil(dur * SR);
  const out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const w = r() * 2 - 1;
    switch (kind) {
      case 'whoosh': {
        const env = Math.sin((Math.PI * t) / dur) ** 2;
        const a = 0.02 + 0.25 * env;
        lp = lp + a * (w - lp);
        out[i] = lp * env * 1.5;
        break;
      }
      case 'impact':
        out[i] = Math.sin(2 * Math.PI * (40 + 120 * Math.exp(-t * 20)) * t) * Math.exp(-t * 5) * 0.9 + w * Math.exp(-t * 25) * 0.5;
        break;
      case 'chime':
        out[i] = [1, 2.76, 5.4].reduce((s, m, k) => s + Math.sin(2 * Math.PI * 880 * m * t) * Math.exp(-t * (2 + k * 2)) * (0.5 / (k + 1)), 0);
        break;
      case 'pop':
        out[i] = Math.sin(2 * Math.PI * (300 + 600 * Math.exp(-t * 40)) * t) * Math.exp(-t * 25);
        break;
      case 'steps': {
        const step = t % 0.4;
        lp = lp + 0.1 * (w - lp);
        out[i] = step < 0.06 ? lp * Math.exp(-step * 60) * 3 : 0;
        break;
      }
      case 'thunder':
        lp = lp + 0.02 * (w - lp);
        out[i] = lp * (Math.exp(-t * 1.2) + 0.5 * Math.exp(-Math.abs(t - 0.6) * 4)) * 6;
        break;
    }
  }
  return normalize(out, 0.9);
}
