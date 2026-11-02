import Link from 'next/link';
import { listProjects } from '@/lib/story/service';
import { budgetSummary } from '@/lib/budget/service';
import { Badge, Card, Empty } from '@/components/ui';
import { DemoProjectButton } from '@/components/demo-button';
import { fmtSec, fmtUsd } from '@/lib/format';
import { WORKFLOW_STAGES } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default function Home() {
  const projects = listProjects().filter((p) => !p.isTemplate);
  const b = budgetSummary();
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projects</h1>
        <div className="flex gap-2">
          <DemoProjectButton />
          <Link href="/projects/new" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-black hover:brightness-110">
            + New project
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Monthly budget" value={fmtUsd(b.settings.monthlyLimitUsd)} />
        <Stat label="Committed this month" value={fmtUsd(b.committed)} sub={`real ${fmtUsd(b.real.charged + b.real.reserved)} · simulated ${fmtUsd(b.simulated.charged + b.simulated.reserved)}`} warn={b.warning} />
        <Stat label="Remaining" value={fmtUsd(b.remaining)} />
        <Stat label="Paid providers" value={b.paidProvidersEnabled ? 'Enabled' : 'Disabled'} sub={b.settings.killSwitch ? 'Kill switch ON' : 'Kill switch off'} />
      </div>
      <Card title={`${projects.length} project(s)`}>
        {projects.length === 0 ? (
          <Empty>No projects yet. Create one, or create the demo project to explore the full workflow.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="pb-2">Title</th>
                <th>Genre</th>
                <th>Series</th>
                <th>Format</th>
                <th>Target</th>
                <th>Stage</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="py-2">
                    <Link className="font-medium text-accent hover:underline" href={`/projects/${p.id}`}>
                      {p.title}
                    </Link>
                  </td>
                  <td>{p.genre}</td>
                  <td>{p.series ? `${p.series.name} · Ep ${p.series.episode}` : '—'}</td>
                  <td>
                    {p.width}×{p.height} @{p.fps}
                  </td>
                  <td>{fmtSec(p.targetDurationSec)}</td>
                  <td>
                    <Badge>
                      {WORKFLOW_STAGES.indexOf(p.stage as never) + 1}/{WORKFLOW_STAGES.length} {p.stage}
                    </Badge>
                  </td>
                  <td className="text-muted">{p.updatedAt.slice(0, 16).replace('T', ' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`rounded-lg border bg-panel px-4 py-3 ${warn ? 'border-amber-500/50' : 'border-line'}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      {sub ? <div className="text-[11px] text-muted">{sub}</div> : null}
    </div>
  );
}
