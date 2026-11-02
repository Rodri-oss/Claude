import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { Card, Empty } from '@/components/ui';
import { NewSeries } from './new-series';

export const dynamic = 'force-dynamic';

export default function SeriesPage() {
  const db = getDb();
  const series = db.select().from(schema.series).all();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Series & episodes</h1>
      <NewSeries />
      {series.length === 0 ? <Empty>No series yet.</Empty> : null}
      {series.map((s) => {
        const eps = db.select({ e: schema.episodes, p: schema.projects }).from(schema.episodes).innerJoin(schema.projects, eq(schema.projects.id, schema.episodes.projectId)).where(eq(schema.episodes.seriesId, s.id)).all();
        const chars = db.select().from(schema.characters).where(eq(schema.characters.seriesId, s.id)).all();
        return (
          <Card key={s.id} title={s.name} actions={<Link href={`/projects/new?series=${s.id}`} className="rounded border border-line px-2 py-1 text-xs hover:border-accent">+ New episode</Link>}>
            <p className="text-sm text-muted">{s.description}</p>
            <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="mb-1 text-xs text-muted">Episodes</div>
                {eps.sort((a, b) => a.e.number - b.e.number).map((e) => (
                  <Link key={e.e.id} href={`/projects/${e.p.id}`} className="block text-accent hover:underline">
                    Ep {e.e.number}: {e.p.title}
                  </Link>
                ))}
              </div>
              <div>
                <div className="mb-1 text-xs text-muted">Recurring cast (locked designs carry across episodes)</div>
                {chars.map((c) => (
                  <Link key={c.id} href={`/characters/${c.id}`} className="block text-accent hover:underline">
                    {c.name} {c.locked ? '🔒' : ''}
                  </Link>
                ))}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
