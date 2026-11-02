import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEnvironment } from '@/lib/environments/service';
import { getAsset } from '@/lib/assets/service';
import { mediaUrl } from '@/lib/media-url';
import { ActionButton, Badge, Card } from '@/components/ui';
import { LayerUpload, LayerParallax, LightingVariant, EnvSettings } from './client';

export const dynamic = 'force-dynamic';

export default async function EnvDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = getEnvironment(id);
  if (!e) notFound();
  const url = (a: string) => mediaUrl(getAsset(a)?.path);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-muted">
            <Link href="/environments" className="hover:text-fg">
              Environments
            </Link>
          </div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            {e.name} {e.locked ? <Badge tone="locked">locked</Badge> : null}
          </h1>
        </div>
        <ActionButton action="environment.setLocked" input={{ environmentId: id, locked: !e.locked }} variant={e.locked ? 'secondary' : 'primary'}>
          {e.locked ? 'Unlock' : 'Approve & lock'}
        </ActionButton>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <Card title="Composite preview">
            <div className="relative aspect-video overflow-hidden rounded" style={{ background: e.backgroundColor }}>
              {e.layers.map((l) => (
                <img key={l.id} src={url(l.assetId)} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ))}
              {e.lighting.tint ? <div className="absolute inset-0 mix-blend-multiply" style={{ background: e.lighting.tint, opacity: e.lighting.tintOpacity }} /> : null}
            </div>
          </Card>
          <Card title="Layers (back → front)" actions={!e.locked ? <LayerUpload environmentId={id} /> : null}>
            <p className="mb-2 text-[11px] text-muted">Layers only exist when you supply separate artwork. A flat AI image is a single background layer; if you split one with segmentation, mark those layers “needs review”.</p>
            <div className="space-y-2">
              {e.layers.map((l) => (
                <div key={l.id} className="flex items-center gap-3 rounded border border-line p-2 text-xs">
                  <img src={url(l.assetId)} alt="" className="h-14 w-24 rounded bg-[repeating-conic-gradient(#333_0_25%,#444_0_50%)] bg-[length:12px_12px] object-cover" />
                  <Badge>{l.role}</Badge>
                  {l.needsReview ? <Badge tone="stale">needs review</Badge> : null}
                  <LayerParallax layerId={l.id} value={l.parallax} disabled={e.locked} />
                  {l.needsReview && !e.locked ? (
                    <ActionButton size="sm" action="environment.updateLayer" input={{ layerId: l.id, needsReview: false }}>
                      Mark reviewed
                    </ActionButton>
                  ) : null}
                  {!e.locked ? (
                    <ActionButton size="sm" variant="ghost" action="environment.removeLayer" input={{ layerId: l.id }}>
                      Remove
                    </ActionButton>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <EnvSettings env={{ id: e.id, name: e.name, description: e.description, category: e.category, timeOfDay: e.timeOfDay, backgroundColor: e.backgroundColor, lighting: e.lighting, locked: e.locked }} />
          <LightingVariant environmentId={id} name={e.name} />
          <Card title="Lighting variants">
            {e.variants.length ? (
              e.variants.map((v) => (
                <Link key={v.id} href={`/environments/${v.id}`} className="block text-sm text-accent hover:underline">
                  {v.name} ({v.timeOfDay})
                </Link>
              ))
            ) : (
              <div className="text-xs text-muted">None</div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
