import { getStory, getCast } from '@/lib/story/service';
import { getPreset, PRESETS } from '@/lib/story/presets';
import { CheckpointBar } from '@/components/checkpoint';
import { StoryEditor } from './editor';

export const dynamic = 'force-dynamic';

export default async function StoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = getStory(id);
  const cast = getCast(id);
  return (
    <div className="space-y-4">
      <CheckpointBar projectId={id} checkpoint="story" note="Approve the script and scene breakdown to move into production." />
      <StoryEditor
        projectId={id}
        project={{ title: s.project.title, preset: s.project.preset, presetName: getPreset(s.project.preset).name, targetDurationSec: s.project.targetDurationSec, sourceInput: s.project.sourceInput, logline: s.project.logline }}
        presets={PRESETS.map((p) => ({ id: p.id, name: p.name }))}
        scenes={s.scenes}
        estimatedRuntimeSec={s.estimatedRuntimeSec}
        speakers={['NARRATOR', ...cast.map((c) => c.name)]}
        styleBible={s.styleBible ?? null}
      />
    </div>
  );
}
