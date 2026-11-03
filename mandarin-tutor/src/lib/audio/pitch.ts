"use client";
/**
 * Pitch tracking for shadowing: estimate the fundamental frequency of a
 * recording over time with normalized autocorrelation, so learners can see
 * their pitch movement next to the target tone shapes.
 */

export interface PitchPoint {
  t: number; // seconds
  hz: number | null; // null = unvoiced / silence
}

export function detectPitch(frame: Float32Array, sampleRate: number, minHz = 70, maxHz = 450): number | null {
  let rms = 0;
  for (let i = 0; i < frame.length; i++) rms += frame[i] * frame[i];
  rms = Math.sqrt(rms / frame.length);
  if (rms < 0.01) return null;

  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.min(Math.floor(sampleRate / minHz), frame.length - 1);
  let bestLag = -1;
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = 0; i + lag < frame.length; i++) {
      sum += frame[i] * frame[i + lag];
      e1 += frame[i] * frame[i];
      e2 += frame[i + lag] * frame[i + lag];
    }
    const r = sum / Math.sqrt(e1 * e2 + 1e-12);
    if (r > best) {
      best = r;
      bestLag = lag;
    }
  }
  if (best < 0.6 || bestLag < 0) return null;
  return sampleRate / bestLag;
}

export function pitchTrack(samples: Float32Array, sampleRate: number, hopSec = 0.01, frameSec = 0.04): PitchPoint[] {
  const hop = Math.floor(sampleRate * hopSec);
  const size = Math.floor(sampleRate * frameSec);
  const out: PitchPoint[] = [];
  for (let start = 0; start + size <= samples.length; start += hop) {
    out.push({ t: start / sampleRate, hz: detectPitch(samples.subarray(start, start + size), sampleRate) });
  }
  // median-of-3 smoothing to remove octave blips
  return out.map((p, i) => {
    if (p.hz == null) return p;
    const win = [out[i - 1]?.hz, p.hz, out[i + 1]?.hz].filter((x): x is number => x != null).sort((a, b) => a - b);
    return { t: p.t, hz: win[Math.floor(win.length / 2)] };
  });
}

export async function pitchFromBlob(blob: Blob): Promise<PitchPoint[]> {
  const buf = await blob.arrayBuffer();
  // decode at a modest rate to keep autocorrelation cheap
  const ac = new OfflineAudioContext(1, 1, 16000);
  const audio = await ac.decodeAudioData(buf);
  const data = audio.getChannelData(0);
  // downsample to ~16 kHz if needed
  const factor = Math.max(1, Math.round(audio.sampleRate / 16000));
  const ds = new Float32Array(Math.floor(data.length / factor));
  for (let i = 0; i < ds.length; i++) ds[i] = data[i * factor];
  return pitchTrack(ds, audio.sampleRate / factor);
}
