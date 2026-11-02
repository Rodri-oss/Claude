import { listAssets } from '@/lib/assets/service';
import { mediaUrl } from '@/lib/media-url';
import { Badge, Card, Empty, UploadButton } from '@/components/ui';

export const dynamic = 'force-dynamic';
const CATS = ['', 'character', 'background', 'prop', 'still', 'video', 'dialogue', 'music', 'ambience', 'sfx', 'thumbnail', 'reference', 'document'];

export default async function Assets({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; scope?: string }> }) {
  const sp = await searchParams;
  const assets = listAssets({ q: sp.q, category: sp.category || undefined, projectId: sp.scope === 'shared' ? null : undefined, limit: 300 });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Asset library</h1>
        <div className="flex gap-2">
          {['character', 'background', 'prop', 'music', 'sfx', 'ambience'].map((c) => (
            <UploadButton key={c} size="sm" category={c} label={`+ ${c}`} />
          ))}
        </div>
      </div>
      <form className="flex gap-2 text-sm">
        <input name="q" defaultValue={sp.q} placeholder="Search name or tag…" className="w-64 rounded-md border border-line bg-panel2 px-2 py-1" />
        <select name="category" defaultValue={sp.category} className="rounded-md border border-line bg-panel2 px-2 py-1">
          {CATS.map((c) => (
            <option key={c} value={c}>
              {c || 'all categories'}
            </option>
          ))}
        </select>
        <select name="scope" defaultValue={sp.scope} className="rounded-md border border-line bg-panel2 px-2 py-1">
          <option value="">all</option>
          <option value="shared">shared library only</option>
        </select>
        <button className="rounded-md border border-line px-3 hover:border-accent">Filter</button>
      </form>
      <Card title={`${assets.length} asset(s)`}>
        {assets.length === 0 ? <Empty>No assets match.</Empty> : null}
        <div className="grid grid-cols-6 gap-3">
          {assets.map((a) => (
            <div key={a.id} className="rounded border border-line p-1.5 text-[11px]">
              {a.kind === 'image' ? (
                <img src={mediaUrl(a.path)} alt="" className="aspect-video w-full rounded bg-[#e9e4da] object-contain" loading="lazy" />
              ) : a.kind === 'video' ? (
                <video src={mediaUrl(a.path)} preload="none" controls className="aspect-video w-full rounded" />
              ) : a.kind === 'audio' ? (
                <audio src={mediaUrl(a.path)} preload="none" controls className="w-full" />
              ) : (
                <div className="flex aspect-video items-center justify-center bg-panel2">doc</div>
              )}
              <div className="mt-1 truncate font-medium" title={a.name}>
                {a.name}
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge>{a.category}</Badge>
                <Badge tone={a.provenance.source === 'mock' ? 'mock' : undefined}>{a.provenance.source}</Badge>
                <Badge>v{a.version}</Badge>
                {a.projectId ? null : <Badge tone="locked">shared</Badge>}
              </div>
              <div className="text-muted">
                {a.width ? `${a.width}×${a.height} ` : ''}
                {a.durationSec ? `${a.durationSec.toFixed(1)}s ` : ''}
                {(a.sizeBytes / 1024).toFixed(0)} KB
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
