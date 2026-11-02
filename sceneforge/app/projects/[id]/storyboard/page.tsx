import Link from 'next/link';
import { getStory, getCast } from '@/lib/story/service';
import { listShots, storyboardCostSummary } from '@/lib/shots/service';
import { isApproved } from '@/lib/approvals/service';
import { allModels } from '@/lib/providers/registry';
import { listEnvironments } from '@/lib/environments/service';
import { listAssets, getAsset } from '@/lib/assets/service';
import { mediaUrl } from '@/lib/media-url';
import { CheckpointBar } from '@/components/checkpoint';
import { ActionButton, Badge, Card, Empty } from '@/components/ui';
import { fmtSec, fmtUsd } from '@/lib/format';
import { ShotEditor } from './shot-editor';

export const dynamic = 'force-dynamic';

export default async function Storyboard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ shot?: string }> }) {
  const { id } = await params;
  const { shot: selected } = await searchParams;
  const story = getStory(id);
  const shots = listShots(id);
  const sum = storyboardCostSummary(id);
  const storyOk = isApproved(id, 'story');
  const cast = getCast(id);
  const sel = shots.find((s) => s.id === selected);
  return (
    <div className="space-y-4">
      <CheckpointBar projectId={id} checkpoint="storyboard" note="Approve the shot structure and estimated production cost." />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3 text-sm">
        <div className="flex flex-wrap gap-4">
          <span>{sum.shots} shots</span>
          <span>{fmtSec(sum.durationSec)} planned</span>
          <span>
            Mode mix A/B/C: {Math.round(sum.mixActual.A * 100)}/{Math.round(sum.mixActual.B * 100)}/{Math.round(sum.mixActual.C * 100)}%
          </span>
          <span>
            Est. AI cost: <b>{fmtUsd(sum.estimatedUsd)}</b> <span className="text-xs text-muted">(B shots: start image + image-to-video; mock prices are simulated)</span>
          </span>
        </div>
        <div className="flex gap-2">
          {!storyOk ? <span className="text-xs text-amber-300">Approve the story first</span> : null}
          <ActionButton variant={shots.length ? 'secondary' : 'primary'} disabled={!storyOk} action="shots.plan" input={{ projectId: id, replace: shots.length > 0 }} confirm={shots.length ? 'Re-plan all shots from the script? Shot edits will be lost (generated versions stay in the asset library).' : undefined} success="Shots planned">
            {shots.length ? 'Re-plan shots' : 'Plan shots from script'}
          </ActionButton>
          <ActionButton disabled={!shots.length} action="storyboard.renderFrames" input={{ projectId: id }} success="Storyboard frames queued (worker)">
            Render storyboard frames
          </ActionButton>
        </div>
      </div>
      <div className={sel ? 'grid grid-cols-3 gap-4' : ''}>
        <div className={sel ? 'col-span-2 space-y-4' : 'space-y-4'}>
          {shots.length === 0 ? <Empty>No shots yet.</Empty> : null}
          {story.scenes.map((sc) => {
            const list = shots.filter((s) => s.sceneId === sc.id);
            return (
              <Card key={sc.id} title={`Scene ${sc.seq}: ${sc.title}`} actions={<ActionButton size="sm" action="shot.create" input={{ projectId: id, sceneId: sc.id }}>+ Shot</ActionButton>}>
                <div className={`grid gap-3 ${sel ? 'grid-cols-3' : 'grid-cols-5'}`}>
                  {list.map((s) => {
                    const t = s.thumbnailAssetId ? mediaUrl(getAsset(s.thumbnailAssetId)?.path) : '';
                    return (
                      <div key={s.id} className={`overflow-hidden rounded-md border ${s.id === selected ? 'border-accent' : 'border-line'} bg-panel2/40`}>
                        <Link href={`?shot=${s.id}`} scroll={false}>
                          {t ? <img src={t} alt="" className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center bg-panel2 text-xs text-muted">no frame</div>}
                        </Link>
                        <div className="space-y-1 p-2 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">#{s.seq}</span>
                            <span className="flex gap-1">
                              <Badge tone={s.mode}>{s.mode}</Badge>
                              <Badge tone={s.approval}>{s.approval}</Badge>
                            </span>
                          </div>
                          <div className="line-clamp-2 text-muted" title={s.purpose}>
                            {s.purpose}
                          </div>
                          <div className="flex justify-between text-muted">
                            <span>
                              {s.camera.framing} · {s.camera.move}
                            </span>
                            <span>{s.durationSec}s</span>
                          </div>
                          <div className="flex justify-between text-muted">
                            <span>{s.dialogueLineIds.length} line(s)</span>
                            <span>{s.estimatedCostUsd ? fmtUsd(s.estimatedCostUsd) : 'free'}</span>
                          </div>
                          <div className="flex flex-wrap gap-1 pt-1">
                            <ActionButton size="sm" variant="ghost" action="shot.move" input={{ shotId: s.id, direction: -1 }}>
                              ←
                            </ActionButton>
                            <ActionButton size="sm" variant="ghost" action="shot.move" input={{ shotId: s.id, direction: 1 }}>
                              →
                            </ActionButton>
                            <ActionButton size="sm" variant="ghost" action="shot.duplicate" input={{ shotId: s.id }}>
                              Dup
                            </ActionButton>
                            <ActionButton size="sm" variant="ghost" action="shot.delete" input={{ shotId: s.id }} confirm="Delete this shot?">
                              Del
                            </ActionButton>
                            {s.approval !== 'approved' ? (
                              <ActionButton size="sm" variant="ghost" action="shot.setApproval" input={{ shotId: s.id, approval: 'approved' }}>
                                ✓
                              </ActionButton>
                            ) : null}
                            {s.approval !== 'rejected' ? (
                              <ActionButton size="sm" variant="ghost" action="shot.setApproval" input={{ shotId: s.id, approval: 'rejected' }}>
                                ✕
                              </ActionButton>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
        {sel ? (
          <div>
            <ShotEditor
              key={sel.id + sel.updatedAt}
              shot={sel}
              lines={story.scenes.find((s) => s.id === sel.sceneId)?.lines.map((l) => ({ id: l.id, label: `${l.speakerName}: ${l.text.slice(0, 60)}` })) ?? []}
              cast={cast.map((c) => ({ id: c.id, name: c.name, poses: Object.keys(c.rig?.poses ?? {}), faces: Object.keys(c.rig?.faces ?? {}) }))}
              envs={listEnvironments().map((e) => ({ id: e.id, name: e.name }))}
              imageModels={allModels('image').map((m) => ({ id: m.id, label: m.label }))}
              videoModels={allModels('video').map((m) => ({ id: m.id, label: m.label }))}
              sfx={listAssets({ category: 'sfx' }).map((a) => ({ id: a.id, name: a.name }))}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
