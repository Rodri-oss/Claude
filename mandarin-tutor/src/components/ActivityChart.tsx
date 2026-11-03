"use client";
import { useState } from "react";

export interface DayPoint {
  date: string;
  reviews: number;
  toneDrills: number;
  shadowing: number;
  minutes: number;
}

const SERIES = [
  { key: "reviews", label: "Card reviews", color: "var(--s1)" },
  { key: "toneDrills", label: "Tone drills", color: "var(--s2)" },
  { key: "shadowing", label: "Shadowing", color: "var(--s3)" },
] as const;

const W = 340;
const H = 150;
const PAD = { l: 28, r: 4, t: 8, b: 20 };
const GAP = 2; // surface gap between stacked segments

function niceMax(v: number): number {
  if (v <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

const fmtDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** 30-day stacked columns: reviews, tone drills and shadowing per day. */
export function ActivityChart({ days }: { days: DayPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = days.map((d) => d.reviews + d.toneDrills + d.shadowing);
  const max = niceMax(Math.max(1, ...totals));
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  const band = plotW / days.length;
  const barW = Math.min(24, band - 2);
  const y = (v: number) => PAD.t + plotH - (v / max) * plotH;
  const ticks = [0, max / 2, max];
  const activeDays = totals.filter((t) => t > 0).length;
  const h = hover != null ? days[hover] : null;

  return (
    <figure className="viz-root space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Activity over the last 30 days: active on ${activeDays} days`} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
              <text x={PAD.l - 4} y={y(t) + 3} textAnchor="end" fontSize={9} fill="var(--muted)" className="tabular-nums">{t}</text>
            </g>
          ))}
          {days.map((d, i) => {
            const cx = PAD.l + band * i + band / 2;
            let acc = 0;
            const segs = SERIES.map((s) => ({ s, v: d[s.key] })).filter((x) => x.v > 0);
            return (
              <g key={d.date}>
                {segs.map(({ s, v }, k) => {
                  const top = y(acc + v);
                  const bottom = y(acc) - (k > 0 ? GAP : 0);
                  acc += v;
                  const hgt = Math.max(0, bottom - top);
                  const isTop = k === segs.length - 1;
                  const r = isTop ? Math.min(4, barW / 2, hgt) : 0;
                  // rounded data-end (top), square at the baseline
                  const x0 = cx - barW / 2;
                  const path = `M${x0},${bottom} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${bottom} Z`;
                  return <path key={s.key} d={path} fill={s.color} opacity={hover == null || hover === i ? 1 : 0.45} />;
                })}
                {/* hit target: the full column band */}
                <rect
                  x={PAD.l + band * i}
                  y={PAD.t}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${fmtDay(d.date)}: ${d.reviews} reviews, ${d.toneDrills} tone drills, ${d.shadowing} shadowing`}
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
              </g>
            );
          })}
          {[0, 14, 29].map((i) => days[i] && (
            <text key={i} x={PAD.l + band * i + band / 2} y={H - 5} textAnchor={i === 0 ? "start" : i === 29 ? "end" : "middle"} fontSize={9} fill="var(--muted)">
              {i === 29 ? "Today" : fmtDay(days[i].date)}
            </text>
          ))}
        </svg>
        {h && hover != null && (
          <div
            className="pointer-events-none absolute top-0 z-10 rounded-lg border border-line bg-card px-2.5 py-2 text-xs shadow-md"
            style={{ left: `${Math.min(70, Math.max(0, ((PAD.l + band * hover) / W) * 100 - 15))}%` }}
            role="status"
          >
            <p className="mb-1 font-semibold">{hover === days.length - 1 ? "Today" : fmtDay(h.date)}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-3" style={{ background: s.color }} />
                <b className="tabular-nums">{h[s.key]}</b> <span className="text-ink-2">{s.label.toLowerCase()}</span>
              </p>
            ))}
            <p className="mt-1 text-muted">{h.minutes} min studied</p>
          </div>
        )}
      </div>
      <details className="text-xs text-ink-2">
        <summary className="cursor-pointer">Show as table</summary>
        <table className="mt-2 w-full tabular-nums">
          <thead>
            <tr className="text-left text-muted"><th>Date</th><th className="text-right">Reviews</th><th className="text-right">Tones</th><th className="text-right">Shadow</th><th className="text-right">Min</th></tr>
          </thead>
          <tbody>
            {days.filter((d) => d.reviews + d.toneDrills + d.shadowing > 0).reverse().map((d) => (
              <tr key={d.date}><td>{d.date}</td><td className="text-right">{d.reviews}</td><td className="text-right">{d.toneDrills}</td><td className="text-right">{d.shadowing}</td><td className="text-right">{d.minutes}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
