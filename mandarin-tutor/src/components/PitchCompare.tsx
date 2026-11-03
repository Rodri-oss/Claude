"use client";
import { contourFor, TONE_SHORT, type Tone } from "@/lib/pinyin";
import type { PitchPoint } from "@/lib/audio/pitch";

const W = 320;
const H = 140;
const PAD = { l: 8, r: 8, t: 10, b: 18 };

/**
 * Your recorded pitch (semitones relative to your own median) over the target
 * tone shapes, laid out evenly across the voiced part of the recording.
 */
export function PitchCompare({ points, tones }: { points: PitchPoint[]; tones: Tone[] }) {
  const voiced = points.filter((p) => p.hz != null) as { t: number; hz: number }[];
  if (voiced.length < 5) {
    return <p className="text-sm text-muted">Couldn&apos;t detect a clear pitch — try recording a little louder and closer to the mic.</p>;
  }
  const hzs = voiced.map((p) => p.hz).sort((a, b) => a - b);
  const median = hzs[Math.floor(hzs.length / 2)];
  const t0 = voiced[0].t;
  const t1 = voiced[voiced.length - 1].t;
  const span = Math.max(0.2, t1 - t0);
  const x = (t: number) => PAD.l + ((t - t0) / span) * (W - PAD.l - PAD.r);
  const ST = 8; // ± semitones shown
  const y = (st: number) => PAD.t + ((ST - Math.max(-ST, Math.min(ST, st))) / (2 * ST)) * (H - PAD.t - PAD.b);
  const chaoToSt = (c: number) => (c - 3) * 3; // Chao 1–5 ≈ −6…+6 semitones

  // user's line, broken at unvoiced gaps
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

  const targets = contourFor(tones);
  const slot = span / tones.length;

  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Your pitch compared with the target tone shapes">
        <line x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeDasharray="3 3" />
        {targets.map((pts, i) => {
          const sx = t0 + slot * i + slot * 0.1;
          const ex = t0 + slot * (i + 1) - slot * 0.1;
          const coords = pts.map((c, k) => `${x(sx + ((ex - sx) * k) / (pts.length - 1 || 1))},${y(chaoToSt(c))}`).join(" ");
          return (
            <g key={i}>
              <polyline points={coords} fill="none" stroke="#2a78d6" strokeOpacity={0.35} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round">
                <title>{`Syllable ${i + 1}: ${TONE_SHORT[tones[i]]} tone`}</title>
              </polyline>
              <text x={x((sx + ex) / 2)} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--muted)">{tones[i] === 5 ? "·" : tones[i]}</text>
            </g>
          );
        })}
        {segs.map((s, i) => (
          <polyline key={i} points={s} fill="none" stroke="#eb6834" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>
      <figcaption className="flex gap-4 text-xs text-ink-2">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded bg-[#2a78d6]/40" /> Target tone shapes</span>
        <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-[#eb6834]" /> Your pitch</span>
      </figcaption>
    </figure>
  );
}
