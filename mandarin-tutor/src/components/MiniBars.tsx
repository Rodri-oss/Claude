/**
 * Small single-series column chart for the admin page. Each column has a
 * native tooltip and an accessible label; the table view lives on the page.
 */
export function MiniBars({ data, label, unit }: { data: { date: string; value: number }[]; label: string; unit: string }) {
  const W = 320;
  const H = 90;
  const PAD = { l: 22, r: 2, t: 6, b: 14 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = max <= 4 ? 4 : Math.ceil(max / 2) * 2;
  const band = (W - PAD.l - PAD.r) / data.length;
  const bw = Math.min(24, band - 2);
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / nice);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${label}, last ${data.length} days; peak ${max} ${unit}`}>
      {[0, nice / 2, nice].map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} />
          <text x={PAD.l - 4} y={y(t) + 3} fontSize={8} textAnchor="end" fill="var(--muted)">{t}</text>
        </g>
      ))}
      {data.map((d, i) => {
        if (!d.value) return null;
        const x = PAD.l + band * i + (band - bw) / 2;
        const top = y(d.value);
        const h = y(0) - top;
        const r = Math.min(3, bw / 2, h);
        return (
          <path key={d.date} d={`M${x},${y(0)} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${y(0)} Z`} fill="var(--s1)">
            <title>{`${d.date}: ${d.value} ${unit}`}</title>
          </path>
        );
      })}
      <text x={PAD.l} y={H - 2} fontSize={8} fill="var(--muted)">{data[0]?.date.slice(5)}</text>
      <text x={W - PAD.r} y={H - 2} fontSize={8} textAnchor="end" fill="var(--muted)">today</text>
    </svg>
  );
}
