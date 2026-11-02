import Link from 'next/link';
import { listEnvironments } from '@/lib/environments/service';
import { getAsset } from '@/lib/assets/service';
import { mediaUrl } from '@/lib/media-url';
import { Badge, Card } from '@/components/ui';
import { NewEnvironment } from './new-env';

export const dynamic = 'force-dynamic';

export default async function Environments({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const envs = listEnvironments(q);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Environments</h1>
        <form>
          <input name="q" defaultValue={q} placeholder="Search name/category…" className="rounded-md border border-line bg-panel2 px-2 py-1 text-sm" />
        </form>
      </div>
      <NewEnvironment />
      <Card title={`${envs.length} reusable environment(s)`}>
        <div className="grid grid-cols-4 gap-3">
          {envs.map((e) => (
            <Link key={e.id} href={`/environments/${e.id}`} className="overflow-hidden rounded-md border border-line hover:border-accent">
              <div className="relative aspect-video" style={{ background: e.backgroundColor }}>
                {e.layers.map((l) => (
                  <img key={l.id} src={mediaUrl(getAsset(l.assetId)?.path)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ))}
                {e.lighting.tint ? <div className="absolute inset-0 mix-blend-multiply" style={{ background: e.lighting.tint, opacity: e.lighting.tintOpacity }} /> : null}
              </div>
              <div className="flex items-center justify-between p-2 text-sm">
                <span>{e.name}</span>
                <span className="flex gap-1">
                  <Badge>{e.timeOfDay}</Badge>
                  {e.locked ? <Badge tone="locked">locked</Badge> : null}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
