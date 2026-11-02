import { decodePcm } from '../media/ffmpeg';

/**
 * Basic mouth-shape cues from speech amplitude (one char per frame: '0' closed, '1' open, '2' wide).
 * This is amplitude-driven "lip flap" for limited animation — not phoneme-accurate lip-sync.
 */
export function mouthCuesFromPcm(pcm: Float32Array, sampleRate: number, fps: number): string {
  const per = sampleRate / fps;
  const frames = Math.ceil(pcm.length / per);
  const rms: number[] = [];
  for (let f = 0; f < frames; f++) {
    let s = 0;
    const a = Math.floor(f * per);
    const b = Math.min(pcm.length, Math.floor((f + 1) * per));
    for (let i = a; i < b; i++) s += pcm[i] * pcm[i];
    rms.push(Math.sqrt(s / Math.max(1, b - a)));
  }
  const sorted = [...rms].sort((x, y) => x - y);
  const p90 = sorted[Math.floor(sorted.length * 0.9)] || 0;
  if (p90 <= 1e-4) return '0'.repeat(frames);
  let out = '';
  let prev = '0';
  for (let f = 0; f < frames; f++) {
    const v = rms[f] / p90;
    let c = v > 0.7 ? '2' : v > 0.22 ? '1' : '0';
    // avoid single-frame flicker between wide/open, but allow natural chatter
    if (c === '2' && prev === '0') c = '1';
    out += c;
    prev = c;
  }
  return out;
}

export async function mouthCuesForFile(file: string, fps: number): Promise<string> {
  const sr = 16000;
  const pcm = await decodePcm(file, sr);
  return mouthCuesFromPcm(pcm, sr, fps);
}
