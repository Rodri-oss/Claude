import Link from 'next/link';
import { getCast, getStory } from '@/lib/story/service';
import { listCharacters } from '@/lib/characters/service';
import { listEnvironments } from '@/lib/environments/service';
import { getAsset } from '@/lib/assets/service';
import { mediaUrl } from '@/lib/media-url';
import { CheckpointBar } from '@/components/checkpoint';
import { ActionButton, Badge, Card } from '@/components/ui';
import { AddCastMember, SceneEnvSelect } from './client';

export const dynamic = 'force-dynamic';

export default async function CharactersTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cast = getCast(id);
  const lib = listCharacters();
  const envs = listEnvironments();
  const story = getStory(id);
  const thumb = (assetId: string | null | undefined) => (assetId ? mediaUrl(getAsset(assetId)?.path) : '');
  return (
    <div className="space-y-4">
      <CheckpointBar projectId={id} checkpoint="art" note="Requires every cast member to have approved art + a locked design, and every scene to have an environment." />
      <Card title="Cast (from the shared Character Library)" actions={<AddCastMember projectId={id} options={lib.filter((c) => !cast.some((x) => x.id === c.id)).map((c) => ({ id: c.id, name: c.name }))} />}>
        <div className="grid grid-cols-4 gap-3">
          {cast.map((c) => {
            const t = c.rig ? thumb(Object.values(c.rig.poses)[0]) : '';
            return (
              <div key={c.id} className="rounded-md border border-line bg-panel2/50 p-3">
                <div className="flex h-44 items-center justify-center rounded bg-[#e9e4da]">{t ? <img src={t} alt={c.name} className="h-full object-contain" /> : <span className="text-xs text-black/50">No approved art</span>}</div>
                <div className="mt-2 flex items-center justify-between">
                  <Link href={`/characters/${c.id}`} className="font-medium text-accent hover:underline">
                    {c.name}
                  </Link>
                  {c.locked ? <Badge tone="locked">locked</Badge> : <Badge tone="stale">unlocked</Badge>}
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  {c.role} · rig: {c.rig ? `${Object.keys(c.rig.poses).length} pose · ${Object.keys(c.rig.faces).length} faces · ${c.rig.mouths ? 'mouths' : 'no mouths'} · ${c.rig.eyesClosed ? 'blink' : 'no blink'}` : 'none'}
                </div>
                <div className="mt-1 text-[11px] text-muted">voice: {c.voiceId || 'auto'}</div>
                <div className="mt-2 flex gap-2">
                  <Link href={`/characters/${c.id}`} className="rounded border border-line px-2 py-1 text-xs hover:border-accent">
                    Open studio
                  </Link>
                  <ActionButton size="sm" variant="ghost" action="character.removeFromProject" input={{ projectId: id, characterId: c.id }}>
                    Remove
                  </ActionButton>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title="Scene environments">
        <table className="w-full text-sm">
          <tbody>
            {story.scenes.map((s) => {
              const env = envs.find((e) => e.id === s.environmentId);
              const layer = env?.layers[0];
              return (
                <tr key={s.id} className="border-t border-line">
                  <td className="w-32 py-2">{layer ? <img src={thumb(layer.assetId)} alt="" className="h-14 w-24 rounded object-cover" /> : <div className="h-14 w-24 rounded bg-panel2" />}</td>
                  <td>
                    <div className="font-medium">
                      {s.seq}. {s.title}
                    </div>
                    <div className="text-xs text-muted">Script location: {s.locationName || '—'}</div>
                  </td>
                  <td className="w-80">
                    <SceneEnvSelect sceneId={s.id} value={s.environmentId} options={envs.map((e) => ({ id: e.id, name: `${e.name}${e.locked ? ' 🔒' : ''}` }))} />
                  </td>
                  <td className="w-24 text-right">{env ? <Link className="text-xs text-accent hover:underline" href={`/environments/${env.id}`}>Edit layers</Link> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
