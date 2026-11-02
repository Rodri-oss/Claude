import { getProject, getStory } from '@/lib/story/service';
import { allCheckpoints, listApprovals } from '@/lib/approvals/service';
import { storyboardCostSummary } from '@/lib/shots/service';
import { projectSpend } from '@/lib/budget/service';
import { latestTimeline } from '@/lib/timeline/builder';
import { Badge, Card } from '@/components/ui';
import { fmtSec, fmtUsd } from '@/lib/format';
import { ProjectSettings } from './settings-form';

export const dynamic = 'force-dynamic';

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getProject(id)!;
  const story = getStory(id);
  const cps = allCheckpoints(id);
  const sb = storyboardCostSummary(id);
  const spend = projectSpend(id);
  const tl = latestTimeline(id);
  const approvals = listApprovals(id);
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-2 space-y-4">
        <Card title="Production status">
          <div className="grid grid-cols-4 gap-3 text-sm">
            <Info k="Scenes" v={String(story.scenes.length)} />
            <Info k="Estimated runtime" v={fmtSec(story.estimatedRuntimeSec)} />
            <Info k="Shots planned" v={`${sb.shots} (${fmtSec(sb.durationSec)})`} />
            <Info k="Timeline" v={tl ? `v${tl.version} · ${fmtSec(tl.data.durationInFrames / tl.data.fps)}` : '—'} />
            <Info k="Mode mix (A/B/C)" v={`${Math.round(sb.mixActual.A * 100)}/${Math.round(sb.mixActual.B * 100)}/${Math.round(sb.mixActual.C * 100)}%`} />
            <Info k="Target mix" v={`${Math.round(p.mix.A * 100)}/${Math.round(p.mix.B * 100)}/${Math.round(p.mix.C * 100)}%`} />
            <Info k="Est. AI cost" v={fmtUsd(sb.estimatedUsd)} />
            <Info k="Spent (incl. simulated)" v={`${fmtUsd(spend.committed)} / ${fmtUsd(p.budgetLimitUsd)}`} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            {(['story', 'art', 'storyboard', 'final'] as const).map((c) => (
              <span key={c} className="flex items-center gap-1">
                {c}: <Badge tone={cps[c].state}>{cps[c].state}</Badge>
              </span>
            ))}
          </div>
        </Card>
        <Card title="Logline & synopsis">
          <p className="text-sm">{p.logline || <span className="text-muted">No logline yet — add a story on the Story tab.</span>}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{p.synopsis}</p>
        </Card>
        <Card title="Approval history">
          {approvals.length === 0 ? (
            <div className="text-sm text-muted">No approvals yet.</div>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {approvals.map((a) => (
                  <tr key={a.id} className="border-t border-line">
                    <td className="py-1.5 text-muted">{a.createdAt.slice(0, 19).replace('T', ' ')}</td>
                    <td>{a.checkpoint}</td>
                    <td>
                      <Badge tone={a.decision}>{a.decision}</Badge>
                    </td>
                    <td>{a.amountUsd ? fmtUsd(a.amountUsd) : ''}</td>
                    <td className="text-muted">{a.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <ProjectSettings project={p} />
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}
