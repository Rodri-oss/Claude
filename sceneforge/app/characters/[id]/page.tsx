import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCharacter, CONTINUITY_ITEMS } from '@/lib/characters/service';
import { getAsset } from '@/lib/assets/service';
import { mediaUrl } from '@/lib/media-url';
import { allModels } from '@/lib/providers/registry';
import { getDb, schema } from '@/lib/db';
import { ActionButton, Badge, Card } from '@/components/ui';
import { CharacterForm, RigPreview, VariantUpload, ContinuityItem } from './client';

export const dynamic = 'force-dynamic';

const GROUPS: [string, string][] = [
  ['view', 'Turnaround views (front / side / back / three-quarter)'],
  ['fullbody', 'Full-body reference'],
  ['sheet', 'Expression / model sheets'],
  ['reference', 'Other references (imported artwork)'],
  ['outfit', 'Outfit variants'],
  ['pose', 'Pose sprites (rig)'],
  ['expression', 'Expression layers (rig: eyes + brows)'],
  ['eyes', 'Blink layer (rig)'],
  ['mouth', 'Mouth shapes (rig: closed / open / wide)'],
];

export default async function CharacterStudio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = getCharacter(id);
  if (!c) notFound();
  const series = getDb().select().from(schema.series).all();
  const url = (assetId: string) => mediaUrl(getAsset(assetId)?.path);
  const rigUrls = c.rig
    ? {
        poses: Object.fromEntries(Object.entries(c.rig.poses).map(([k, v]) => [k, url(v)])),
        faces: Object.fromEntries(Object.entries(c.rig.faces).map(([k, v]) => [k, url(v)])),
        eyesClosed: c.rig.eyesClosed ? url(c.rig.eyesClosed) : null,
        mouths: c.rig.mouths ? [url(c.rig.mouths.closed), url(c.rig.mouths.open), url(c.rig.mouths.wide)] : null,
      }
    : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted">
            <Link href="/characters" className="hover:text-fg">
              Character library
            </Link>{' '}
            / Character Studio
          </div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            {c.name} {c.locked ? <Badge tone="locked">design locked</Badge> : <Badge tone="stale">unlocked</Badge>}
          </h1>
        </div>
        <div className="flex gap-2">
          {!c.locked ? (
            <>
              <ActionButton action="character.rebuildRig" input={{ characterId: id }} success="Rig rebuilt from approved variants">
                Rebuild rig
              </ActionButton>
              <ActionButton variant="primary" action="character.setLocked" input={{ characterId: id, locked: true }} success="Design locked">
                Approve &amp; lock design
              </ActionButton>
            </>
          ) : (
            <ActionButton action="character.setLocked" input={{ characterId: id, locked: false }} confirm="Unlock this design? Art approvals of projects using it will become stale if you change it.">
              Unlock
            </ActionButton>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-4">
          <Card title="Rig preview (limited animation)">{rigUrls ? <RigPreview rig={rigUrls} /> : <div className="text-sm text-muted">Approve pose / reference images, then Rebuild rig.</div>}</Card>
          <Card title="Continuity checklist">
            <div className="space-y-1">
              {CONTINUITY_ITEMS.map((i) => (
                <ContinuityItem key={i} characterId={id} item={i} checked={!!c.continuity[i]} disabled={c.locked} />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted">All items must be checked before locking. Consistency is reviewed by you — it is not scored automatically.</p>
          </Card>
          <Card title="Used in projects">
            {c.projects.length ? (
              c.projects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="block text-sm text-accent hover:underline">
                  {p.title}
                </Link>
              ))
            ) : (
              <div className="text-sm text-muted">Not used yet.</div>
            )}
          </Card>
        </div>
        <div className="col-span-2 space-y-4">
          <CharacterForm
            character={{ id: c.id, name: c.name, description: c.description, personality: c.personality, palette: c.palette, proportions: c.proportions, identifyingDetails: c.identifyingDetails, seriesId: c.seriesId, voiceProvider: c.voiceProvider, voiceId: c.voiceId, voiceSettings: c.voiceSettings, locked: c.locked }}
            series={series.map((s) => ({ id: s.id, name: s.name }))}
            ttsModels={allModels('tts').map((m) => ({ id: m.id, label: m.label, voices: m.voices ?? [] }))}
          />
          <Card title="Artwork & variants" actions={!c.locked ? <VariantUpload characterId={id} /> : <span className="text-xs text-muted">Locked — unlock to change art</span>}>
            <div className="space-y-4">
              {GROUPS.map(([kind, label]) => {
                const vs = c.variants.filter((v) => v.kind === kind);
                return (
                  <div key={kind}>
                    <div className="mb-1 text-xs font-medium text-muted">{label}</div>
                    <div className="flex flex-wrap gap-2">
                      {vs.length === 0 ? <div className="flex h-24 w-24 items-center justify-center rounded border border-dashed border-line text-[10px] text-muted">empty</div> : null}
                      {vs.map((v) => (
                        <div key={v.id} className={`w-28 rounded border p-1 ${v.approved ? 'border-emerald-500/50' : 'border-line'}`}>
                          <div className="flex h-28 items-center justify-center rounded bg-[#e9e4da]">
                            <img src={url(v.assetId)} alt={v.name} className="max-h-full max-w-full object-contain" />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[10px]">
                            <span className="truncate">{v.name}</span>
                            {v.approved ? <Badge tone="approved">ok</Badge> : <Badge tone="pending">draft</Badge>}
                          </div>
                          {!c.locked ? (
                            <div className="flex gap-1">
                              <ActionButton size="sm" variant="ghost" action="character.variantApproval" input={{ variantId: v.id, approved: !v.approved }}>
                                {v.approved ? 'Unapprove' : 'Approve'}
                              </ActionButton>
                              <ActionButton size="sm" variant="ghost" action="character.removeVariant" input={{ variantId: v.id }}>
                                ✕
                              </ActionButton>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
