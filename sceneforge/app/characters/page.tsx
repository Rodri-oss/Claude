import Link from 'next/link';
import { listCharacters } from '@/lib/characters/service';
import { getAsset } from '@/lib/assets/service';
import { mediaUrl } from '@/lib/media-url';
import { getDb, schema } from '@/lib/db';
import { Badge, Card, Empty } from '@/components/ui';
import { NewCharacter } from './new-character';

export const dynamic = 'force-dynamic';

export default async function CharacterLibrary({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const chars = listCharacters({ q });
  const series = getDb().select().from(schema.series).all();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Character library</h1>
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Search…" className="rounded-md border border-line bg-panel2 px-2 py-1 text-sm" />
        </form>
      </div>
      <NewCharacter series={series.map((s) => ({ id: s.id, name: s.name }))} />
      <Card title={`${chars.length} character(s) — shared across all projects and episodes`}>
        {chars.length === 0 ? <Empty>No characters yet.</Empty> : null}
        <div className="grid grid-cols-6 gap-3">
          {chars.map((c) => {
            const t = c.thumbAssetId ? mediaUrl(getAsset(c.thumbAssetId)?.path) : '';
            return (
              <Link key={c.id} href={`/characters/${c.id}`} className="rounded-md border border-line bg-panel p-2 hover:border-accent">
                <div className="flex h-40 items-center justify-center rounded bg-[#e9e4da]">{t ? <img src={t} alt={c.name} className="h-full object-contain" /> : <span className="text-xs text-black/40">no art</span>}</div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{c.name}</span>
                  {c.locked ? <Badge tone="locked">locked</Badge> : null}
                </div>
                <div className="line-clamp-2 text-[11px] text-muted">{c.description}</div>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
