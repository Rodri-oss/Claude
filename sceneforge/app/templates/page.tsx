import Link from 'next/link';
import { PRESETS } from '@/lib/story/presets';
import { listProjects } from '@/lib/story/service';
import { Badge, Card } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function Templates() {
  const tpls = listProjects().filter((p) => p.isTemplate);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Project templates</h1>
      <Card title="Your templates (projects marked “Use as template” — new projects copy their cast)">
        {tpls.length === 0 ? <div className="text-sm text-muted">None yet. Tick “Use as project template” in a project’s Overview settings.</div> : null}
        {tpls.map((t) => (
          <div key={t.id} className="flex items-center justify-between border-t border-line py-2 text-sm">
            <span>{t.title}</span>
            <Link href={`/projects/new?template=${t.id}`} className="text-accent hover:underline">
              New project from template →
            </Link>
          </div>
        ))}
      </Card>
      <Card title="Genre presets">
        <div className="grid grid-cols-3 gap-3">
          {PRESETS.map((p) => (
            <div key={p.id} className="rounded border border-line p-3 text-sm">
              <div className="flex items-center justify-between font-medium">
                {p.name} <Badge>{p.productionStyle}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted">{p.description}</p>
              <p className="mt-1 text-[11px] text-muted">Beats: {p.beats.join(' → ')}</p>
              <p className="text-[11px] text-muted">
                Default mix A/B/C {Math.round(p.mix.A * 100)}/{Math.round(p.mix.B * 100)}/{Math.round(p.mix.C * 100)}% · {p.style.artStyle}
              </p>
              <div className="mt-1 flex gap-1">
                {p.style.palette.map((c) => (
                  <span key={c} className="h-4 w-4 rounded" style={{ background: c }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted">Presets seed a new project&apos;s Style Bible once. Later preset changes never override an existing project&apos;s approved visual decisions.</p>
      </Card>
    </div>
  );
}
