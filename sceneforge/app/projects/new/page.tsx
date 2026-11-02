import { PRESETS } from '@/lib/story/presets';
import { getDb, schema } from '@/lib/db';
import { listProjects } from '@/lib/story/service';
import { NewProjectForm } from './form';

export const dynamic = 'force-dynamic';

export default async function NewProject({ searchParams }: { searchParams: Promise<{ template?: string; series?: string }> }) {
  const sp = await searchParams;
  const series = getDb().select().from(schema.series).all();
  const templates = listProjects().filter((p) => p.isTemplate);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">New project</h1>
      <NewProjectForm presets={PRESETS.map((p) => ({ id: p.id, name: p.name, description: p.description, style: p.productionStyle }))} series={series} templates={templates.map((t) => ({ id: t.id, title: t.title, preset: t.preset }))} initialTemplate={sp.template} initialSeries={sp.series} />
    </div>
  );
}
