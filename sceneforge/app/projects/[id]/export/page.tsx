import { latestTimeline } from '@/lib/timeline/builder';
import { listExports } from '@/lib/rendering/export';
import { checkpointStatus } from '@/lib/approvals/service';
import { getStory } from '@/lib/story/service';
import { mediaUrl } from '@/lib/media-url';
import { CheckpointBar } from '@/components/checkpoint';
import { ActionButton, Badge, Card, Empty } from '@/components/ui';
import { fmtSec } from '@/lib/format';
import { JobsPoller } from '../audio/client';

export const dynamic = 'force-dynamic';

export default async function ExportTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tl = latestTimeline(id);
  const fin = checkpointStatus(id, 'final');
  const exports = listExports(id);
  const scenes = getStory(id).scenes;
  const mockCount = tl ? tl.data.clips.filter((c) => c.badge).length : 0;
  return (
    <div className="space-y-4">
      <JobsPoller projectId={id} />
      <CheckpointBar projectId={id} checkpoint="final" note={tl ? `Approves timeline v${tl.version} exactly. Any later edit makes this approval stale.` : 'Build the timeline in the Editor first.'} />
      {tl && mockCount ? <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-xs text-yellow-200">{mockCount} shot(s) carry an on-screen label (mock output or pending AI shot). Mock footage is placeholder content, not real AI generation.</div> : null}
      <Card title="Render">
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton variant="primary" disabled={fin.state !== 'approved'} action="export.request" input={{ projectId: id, kind: 'final' }} success="Final export queued (worker)">
            Export final MP4 (H.264/AAC + SRT + scene files + manifest)
          </ActionButton>
          <ActionButton action="export.request" input={{ projectId: id, kind: 'preview', scale: 0.5 }} success="Preview render queued (worker)">
            Preview render (half-res)
          </ActionButton>
          {scenes.map((s) => (
            <ActionButton key={s.id} size="sm" action="export.request" input={{ projectId: id, kind: 'preview', sceneId: s.id, scale: 0.5 }} success={`Scene ${s.seq} preview queued`}>
              Scene {s.seq} preview
            </ActionButton>
          ))}
        </div>
        {fin.state !== 'approved' ? <p className="mt-2 text-xs text-muted">Final export requires Checkpoint 5 (final review) on the current timeline version.</p> : null}
      </Card>
      {exports.length === 0 ? <Empty>No exports yet.</Empty> : null}
      {exports.map((e) => {
        const v = (e.validation ?? {}) as { ok?: boolean; reasons?: string[]; audioPeakDb?: number; targetDeviationPct?: number; renderSeconds?: number; decodable?: boolean };
        return (
          <Card key={e.id} title={`${e.kind === 'final' ? 'Final' : 'Preview'} · ${e.createdAt.slice(0, 16).replace('T', ' ')}`} actions={<Badge tone={e.status === 'completed' ? 'completed' : e.status === 'failed' ? 'failed' : e.status === 'completed_with_warnings' ? 'stale' : 'QUEUED'}>{e.status}</Badge>}>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">{e.videoPath ? <video src={mediaUrl(e.videoPath)} controls preload="metadata" className="w-full rounded border border-line" /> : <div className="text-sm text-muted">Rendering… progress shows in the Jobs list.</div>}</div>
              <div className="space-y-1 text-xs">
                {e.durationSec ? (
                  <div>
                    Duration <b>{fmtSec(e.durationSec)}</b> ({e.durationSec.toFixed(2)}s) · {e.width}×{e.height} @ {e.fps} fps
                  </div>
                ) : null}
                {e.sizeBytes ? <div>Size {(e.sizeBytes / 1e6).toFixed(1)} MB</div> : null}
                {v.reasons ? (
                  <div>
                    Validation: <Badge tone={v.ok ? 'approved' : 'stale'}>{v.ok ? 'passed' : 'warnings'}</Badge>
                    {v.reasons.map((r) => (
                      <div key={r} className="text-amber-300">
                        • {r}
                      </div>
                    ))}
                    <div className="text-muted">
                      decodable: {String(v.decodable)} · audio peak {v.audioPeakDb} dBFS · target deviation {v.targetDeviationPct}% · render {v.renderSeconds}s
                    </div>
                  </div>
                ) : null}
                <div className="space-x-2 pt-2">
                  {e.videoPath ? <a className="text-accent hover:underline" href={`${mediaUrl(e.videoPath)}?download`}>MP4</a> : null}
                  {e.srtPath ? <a className="text-accent hover:underline" href={`${mediaUrl(e.srtPath)}?download`}>SRT</a> : null}
                  {e.manifestPath ? <a className="text-accent hover:underline" href={mediaUrl(e.manifestPath)} target="_blank">Manifest</a> : null}
                </div>
                {e.sceneFiles.length ? (
                  <div className="pt-1">
                    Scene files:{' '}
                    {e.sceneFiles.map((f, i) => (
                      <a key={f} className="mr-2 text-accent hover:underline" href={`${mediaUrl(f)}?download`}>
                        {i + 1}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
