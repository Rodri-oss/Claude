import { listDialogueAudio, getNarratorVoice } from '@/lib/audio/service';
import { isApproved } from '@/lib/approvals/service';
import { allModels } from '@/lib/providers/registry';
import { listAssets, getAsset } from '@/lib/assets/service';
import { mediaUrl } from '@/lib/media-url';
import { ActionButton, Badge, Card, Empty } from '@/components/ui';
import { ImportLine, NarratorVoice, SceneAudio, JobsPoller } from './client';

export const dynamic = 'force-dynamic';

export default async function AudioTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = listDialogueAudio(id);
  const ok = isApproved(id, 'story');
  const missing = data.flatMap((s) => s.lines).filter((l) => !l.active).length;
  const music = listAssets({ category: 'music' }).map((a) => ({ id: a.id, name: a.name }));
  const amb = listAssets({ category: 'ambience' }).map((a) => ({ id: a.id, name: a.name }));
  return (
    <div className="space-y-4">
      <JobsPoller projectId={id} />
      <div className="flex items-center justify-between rounded-lg border border-line bg-panel px-4 py-3 text-sm">
        <div>
          {missing ? `${missing} line(s) without audio.` : 'All lines have audio.'} Voices come from each character&apos;s voice assignment (Character Studio). Timing in the editor uses the actual audio durations.
          {!ok ? <span className="ml-2 text-amber-300">Approve the story to generate voices.</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <NarratorVoice projectId={id} current={getNarratorVoice(id)} models={allModels('tts').map((m) => ({ id: m.id, label: m.label, voices: m.voices ?? [] }))} />
          <ActionButton variant="primary" disabled={!ok || !missing} action="audio.generate" input={{ projectId: id }} success="Voice jobs queued (worker)">
            Generate missing lines
          </ActionButton>
        </div>
      </div>
      {data.length === 0 ? <Empty>No dialogue yet.</Empty> : null}
      {data.map(({ scene, lines }) => (
        <Card key={scene.id} title={`Scene ${scene.seq}: ${scene.title}`} actions={<SceneAudio sceneId={scene.id} music={scene.music} ambience={scene.ambience} musicOptions={music} ambienceOptions={amb} />}>
          <table className="w-full text-xs">
            <tbody>
              {lines.map((l) => {
                const a = l.active ? getAsset(l.active.assetId) : null;
                return (
                  <tr key={l.id} className="border-t border-line align-middle">
                    <td className="w-28 py-2 font-medium">{l.speakerName}</td>
                    <td className="w-20">
                      <Badge>{l.emotion}</Badge>
                    </td>
                    <td className="pr-3">{l.text}</td>
                    <td className="w-72">{a ? <audio controls preload="none" src={mediaUrl(a.path)} className="h-8 w-full" /> : <span className="text-muted">no audio</span>}</td>
                    <td className="w-40 text-muted">
                      {l.active ? (
                        <>
                          {l.active.durationSec.toFixed(2)}s · <Badge tone={l.active.provider === 'mock' ? 'mock' : undefined}>{l.active.provider === 'mock' ? 'MOCK voice' : l.active.provider}</Badge> v{l.active.version}
                        </>
                      ) : null}
                      {l.segments.length > 1 ? (
                        <details>
                          <summary className="cursor-pointer">history ({l.segments.length})</summary>
                          {l.segments.map((g) => (
                            <div key={g.id} className="flex items-center gap-1">
                              v{g.version} {g.provider} {g.durationSec.toFixed(1)}s
                              {g.id !== l.activeAudioId ? (
                                <ActionButton size="sm" variant="ghost" action="audio.useSegment" input={{ lineId: l.id, segmentId: g.id }}>
                                  use
                                </ActionButton>
                              ) : (
                                <span className="text-emerald-300">active</span>
                              )}
                            </div>
                          ))}
                        </details>
                      ) : null}
                    </td>
                    <td className="w-48 text-right">
                      <div className="flex justify-end gap-1">
                        <ActionButton size="sm" disabled={!ok} action="audio.generate" input={{ projectId: id, lineIds: [l.id], regenerate: !!l.active }} success="Queued">
                          {l.active ? 'Regenerate' : 'Generate'}
                        </ActionButton>
                        <ImportLine projectId={id} lineId={l.id} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}
