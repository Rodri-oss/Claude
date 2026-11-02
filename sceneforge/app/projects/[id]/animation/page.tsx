import { listShots } from '@/lib/shots/service';
import { listJobs } from '@/lib/jobs/queue';
import { isApproved } from '@/lib/approvals/service';
import { budgetSummary, projectSpend } from '@/lib/budget/service';
import { getProject } from '@/lib/story/service';
import { getAsset } from '@/lib/assets/service';
import { mediaUrl } from '@/lib/media-url';
import { ActionButton, Badge, Card, Empty } from '@/components/ui';
import { fmtUsd } from '@/lib/format';
import { JobsTable } from '@/components/jobs-table';
import { JobsPoller } from '../audio/client';
import { ApprovalPanel, ReplaceShot } from './client';

export const dynamic = 'force-dynamic';

export default async function AnimationTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getProject(id)!;
  const gated = !isApproved(id, 'art') || !isApproved(id, 'storyboard');
  const shots = listShots(id);
  const ai = shots.filter((s) => s.mode !== 'A');
  const awaiting = listJobs({ projectId: id, states: ['AWAITING_APPROVAL'] });
  const active = listJobs({ projectId: id, states: ['QUEUED', 'SUBMITTED', 'RUNNING', 'NEEDS_RECONCILIATION'] });
  const recent = listJobs({ projectId: id, states: ['COMPLETED', 'FAILED', 'CANCELLED'], limit: 15 });
  const b = budgetSummary();
  const spend = projectSpend(id);
  const url = (assetId: string) => mediaUrl(getAsset(assetId)?.path);
  return (
    <div className="space-y-4">
      <JobsPoller projectId={id} />
      {gated ? <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">Generation is locked until Art (checkpoint 2) and Storyboard (checkpoint 3) are approved.</div> : null}
      <Card title="Checkpoint 4 — Generation approval" actions={<span className="text-xs text-muted">Month remaining {fmtUsd(b.remaining)} · project {fmtUsd(spend.committed)} / {fmtUsd(p.budgetLimitUsd)} · max batch {fmtUsd(b.settings.maxBatchUsd)}</span>}>
        <ApprovalPanel projectId={id} jobs={awaiting.map((j) => ({ id: j.id, kind: j.kind, model: j.model, shotId: j.shotId, est: j.estimatedCostUsd, breakdown: String((j.input as { estimateBreakdown?: string }).estimateBreakdown ?? ''), simulated: j.simulatedCost, revision: j.isRevision }))} shotSeq={Object.fromEntries(shots.map((s) => [s.id, s.seq]))} />
        <p className="mt-2 text-[11px] text-muted">Approving reserves the estimate in the budget ledger and authorizes exactly these jobs. Safe technical failures (not billed) may be retried automatically within this approval; new variations always need a new approval.</p>
      </Card>
      <Card title="Active jobs">
        <JobsTable jobs={active} />
      </Card>
      <Card title={`AI & still shots (${ai.length})`}>
        {ai.length === 0 ? <Empty>No Mode B/C shots. Change a shot&apos;s mode on the Storyboard tab.</Empty> : null}
        <div className="space-y-3">
          {ai.map((s) => {
            const starts = s.versions.filter((v) => v.kind === 'start_image');
            const vids = s.versions.filter((v) => v.kind === 'video' || v.kind === 'still');
            const startApproved = starts.find((v) => v.id === s.startImageVersionId)?.status === 'approved';
            return (
              <div key={s.id} className="rounded-md border border-line bg-panel2/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <b>#{s.seq}</b> <Badge tone={s.mode}>{s.mode}</Badge> <span className="text-muted">{s.purpose}</span> <span className="text-xs text-muted">{s.durationSec}s · est {fmtUsd(s.estimatedCostUsd)} · actual {fmtUsd(s.actualCostUsd)}</span>
                  </div>
                  <div className="flex gap-1">
                    <ActionButton size="sm" disabled={gated} action="shot.requestStartImage" input={{ shotId: s.id, regenerate: starts.length > 0 }} success="Start-image job created — approve it above">
                      {starts.length ? 'New start image' : 'Request start image'}
                    </ActionButton>
                    {s.mode === 'B' ? (
                      <ActionButton size="sm" disabled={gated || !startApproved} action="shot.requestVideo" input={{ shotId: s.id, regenerate: vids.length > 0 }} success="Video job created — approve it above" title={!startApproved ? 'Approve a start image first' : ''}>
                        {vids.length ? 'New video variation' : 'Animate (image→video)'}
                      </ActionButton>
                    ) : null}
                    <ReplaceShot shotId={s.id} projectId={id} />
                  </div>
                </div>
                <div className="flex gap-4 overflow-x-auto">
                  <VersionStrip title="Start images" versions={starts} activeId={s.startImageVersionId} url={url} />
                  <VersionStrip title={s.mode === 'B' ? 'Video takes' : 'Stills'} versions={vids} activeId={s.activeVersionId} url={url} />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Recent finished jobs">
        <JobsTable jobs={recent} />
      </Card>
    </div>
  );
}

function VersionStrip({ title, versions, activeId, url }: { title: string; versions: { id: string; version: number; kind: string; assetId: string; status: string; source: string }[]; activeId: string | null; url: (id: string) => string }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-muted">{title}</div>
      <div className="flex gap-2">
        {versions.length === 0 ? <div className="flex h-24 w-40 items-center justify-center rounded border border-dashed border-line text-[11px] text-muted">none</div> : null}
        {versions.map((v) => (
          <div key={v.id} className={`w-44 rounded border p-1 ${v.id === activeId ? 'border-accent' : 'border-line'}`}>
            {v.kind === 'video' ? <video src={url(v.assetId)} controls preload="metadata" className="aspect-video w-full rounded" /> : <img src={url(v.assetId)} alt="" className="aspect-video w-full rounded object-cover" />}
            <div className="mt-1 flex items-center justify-between text-[10px]">
              <span>
                v{v.version} {v.source === 'mock' ? <Badge tone="mock">MOCK</Badge> : v.source}
              </span>
              <Badge tone={v.status}>{v.status}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {v.status !== 'approved' ? (
                <ActionButton size="sm" variant="ghost" action="shot.versionStatus" input={{ versionId: v.id, status: 'approved' }}>
                  Approve
                </ActionButton>
              ) : null}
              {v.status !== 'rejected' ? (
                <ActionButton size="sm" variant="ghost" action="shot.versionStatus" input={{ versionId: v.id, status: 'rejected' }}>
                  Reject
                </ActionButton>
              ) : (
                <ActionButton size="sm" variant="ghost" action="shot.versionStatus" input={{ versionId: v.id, status: 'candidate' }}>
                  Un-reject
                </ActionButton>
              )}
              {v.id !== activeId && v.status !== 'rejected' ? (
                <ActionButton size="sm" variant="ghost" action="shot.useVersion" input={{ versionId: v.id }}>
                  Use / revert
                </ActionButton>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
