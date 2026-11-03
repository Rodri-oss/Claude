import { CHAO, type Tone } from "@/lib/pinyin";

const COLORS: Record<Tone, string> = { 1: "var(--t1)", 2: "var(--t2)", 3: "var(--t3)", 4: "var(--t4)", 5: "var(--t5)" };

/** A tiny Chao-letter diagram of a tone's pitch shape. */
export function ToneShape({ tone, size = 28 }: { tone: Tone; size?: number }) {
  const pts = tone === 5 ? [3] : CHAO[tone];
  const y = (lvl: number) => 4 + ((5 - lvl) / 4) * (size - 8);
  const xs = pts.length === 1 ? [size / 2] : pts.map((_, i) => 4 + (i / (pts.length - 1)) * (size - 8));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="inline-block">
      <line x1={2} x2={size - 2} y1={y(1)} y2={y(1)} stroke="var(--line)" strokeWidth={1} />
      <line x1={2} x2={size - 2} y1={y(5)} y2={y(5)} stroke="var(--line)" strokeWidth={1} />
      {pts.length === 1 ? (
        <circle cx={xs[0]} cy={y(pts[0])} r={3} fill={COLORS[tone]} />
      ) : (
        <polyline
          points={pts.map((p, i) => `${xs[i]},${y(p)}`).join(" ")}
          fill="none"
          stroke={COLORS[tone]}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export const TONE_COLOR = COLORS;
