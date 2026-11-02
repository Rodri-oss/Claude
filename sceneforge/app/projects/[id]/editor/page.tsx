import { latestTimeline, getEditorSettings } from '@/lib/timeline/builder';
import { listShots } from '@/lib/shots/service';
import { listAssets } from '@/lib/assets/service';
import { isApproved } from '@/lib/approvals/service';
import { Editor } from './editor';

export const dynamic = 'force-dynamic';

export default async function EditorTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tl = latestTimeline(id);
  const ed = getEditorSettings(id);
  const shots = listShots(id).map((s) => ({ id: s.id, seq: s.seq, durationSec: s.durationSec, trimStartSec: s.trimStartSec, transitionIn: s.transitionIn, mode: s.mode, purpose: s.purpose }));
  return (
    <Editor
      projectId={id}
      initial={tl ? { id: tl.id, version: tl.version, timeline: tl.data } : null}
      settings={{ tracks: ed.tracks, musicAssetId: ed.musicAssetId, ambienceAssetId: ed.ambienceAssetId, musicFadeSec: ed.musicFadeSec, transitionFrames: ed.transitionFrames }}
      shots={shots}
      music={listAssets({ category: 'music' }).map((a) => ({ id: a.id, name: a.name }))}
      ambience={listAssets({ category: 'ambience' }).map((a) => ({ id: a.id, name: a.name }))}
      storyboardApproved={isApproved(id, 'storyboard')}
    />
  );
}
