import { budgetSummary, ledgerEntries } from '@/lib/budget/service';
import { listProjects } from '@/lib/story/service';
import { listJobs } from '@/lib/jobs/queue';
import { ActionButton, Badge, Card } from '@/components/ui';
import { fmtUsd } from '@/lib/format';
import { BudgetForm } from './form';

export const dynamic = 'force-dynamic';

export default function Budget() {
  const b = budgetSummary();
  const projects = Object.fromEntries(listProjects().map((p) => [p.id, p.title]));
  const upcoming = listJobs({ states: ['AWAITING_APPROVAL', 'QUEUED', 'SUBMITTED', 'RUNNING'] }).filter((j) => j.estimatedCostUsd > 0);
  const ledger = ledgerEntries({ month: b.month, limit: 100 });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Budget — {b.month}</h1>
      {b.warning ? <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">Warning: {Math.round(b.usage * 100)}% of the monthly limit is committed.</div> : null}
      <div className="grid grid-cols-5 gap-3 text-sm">
        <Card title="Monthly limit">{fmtUsd(b.settings.monthlyLimitUsd)}</Card>
        <Card title="Real charged">{fmtUsd(b.real.charged)}</Card>
        <Card title="Real reserved">{fmtUsd(b.real.reserved)}</Card>
        <Card title="Simulated (mock)">{fmtUsd(b.simulated.charged + b.simulated.reserved)}</Card>
        <Card title="Remaining">{fmtUsd(b.remaining)}</Card>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Card title="Planning allocation vs usage">
          {Object.entries(b.byCategory).map(([k, v]) => (
            <div key={k} className="mb-2 text-xs">
              <div className="flex justify-between">
                <span className="capitalize">{k}</span>
                <span>
                  {fmtUsd(v.used)} / {fmtUsd(v.planned)}
                </span>
              </div>
              <div className="h-1.5 rounded bg-panel2">
                <div className={`h-1.5 rounded ${v.used > v.planned ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${Math.min(100, (v.used / Math.max(0.01, v.planned)) * 100)}%` }} />
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted">Allocations are planning guides, not separate wallets.</p>
        </Card>
        <Card title="By project">
          {Object.entries(b.byProject).map(([k, v]) => (
            <div key={k} className="flex justify-between text-xs">
              <span>{projects[k] ?? k}</span>
              <span>{fmtUsd(v)}</span>
            </div>
          ))}
        </Card>
        <Card title={`Estimated upcoming jobs (${upcoming.length})`}>
          {upcoming.map((j) => (
            <div key={j.id} className="flex justify-between text-xs">
              <span>
                {j.kind} <Badge tone={j.state}>{j.state}</Badge>
              </span>
              <span>{fmtUsd(j.estimatedCostUsd)}</span>
            </div>
          ))}
        </Card>
      </div>
      <BudgetForm settings={b.settings} />
      <Card title="Ledger this month" actions={<ActionButton size="sm" variant="ghost" action="budget.resetSimulated" confirm="Delete all simulated (mock) ledger entries? Real spend is never touched.">Reset simulated spend</ActionButton>}>
        <table className="w-full text-xs">
          <tbody>
            {ledger.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="py-1 text-muted">{r.createdAt.slice(0, 19).replace('T', ' ')}</td>
                <td>{projects[r.projectId ?? ''] ?? '—'}</td>
                <td>
                  {r.type} {r.simulated ? <Badge tone="mock">sim</Badge> : null}
                </td>
                <td>{r.category}</td>
                <td>{r.model}</td>
                <td className="text-right">
                  {r.type === 'release' ? '−' : ''}
                  {fmtUsd(r.amountUsd)}
                </td>
                <td className="text-muted">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-muted">Internal estimates may not exactly match provider invoices. Always reconcile against each provider&apos;s billing dashboard.</p>
      </Card>
    </div>
  );
}
