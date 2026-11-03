import type { ToneStat } from "@/lib/toneStats";
import { TONE_SHORT, type Tone } from "@/lib/pinyin";
import { ToneShape } from "./ToneShape";

/** Accuracy per tone as horizontal bars, with the value printed on each row. */
export function ToneAccuracy({ stats, weakest }: { stats: ToneStat[]; weakest: Tone | null }) {
  return (
    <ul className="space-y-2" data-testid="tone-accuracy">
      {stats.map((s) => {
        const pct = s.accuracy == null ? null : Math.round(s.accuracy * 100);
        return (
          <li key={s.tone} className="flex items-center gap-2 text-sm" title={`${TONE_SHORT[s.tone]} tone: ${s.correct}/${s.attempts} correct`}>
            <ToneShape tone={s.tone} size={22} />
            <span className="w-16 shrink-0 capitalize">{TONE_SHORT[s.tone]}</span>
            <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-line/60" role="presentation">
              {pct != null && (
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.max(pct, 2)}%`, background: s.tone === weakest ? "var(--accent)" : "var(--s1)" }}
                />
              )}
            </div>
            <span className="w-24 shrink-0 text-right tabular-nums text-ink-2">
              {pct == null ? <span className="text-muted">no data</span> : <>{pct}% <span className="text-xs text-muted">({s.attempts})</span></>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
