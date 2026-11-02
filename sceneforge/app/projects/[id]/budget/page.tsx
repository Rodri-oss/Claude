import { ledgerEntries, projectSpend } from '@/lib/budget/service';
import { getProject } from '@/lib/story/service';
import { listShots, storyboardCostSummary } from '@/lib/shots/service';
import { Badge, Card } from '@/components/ui';
import { fmtUsd } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ProjectBudget({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getProject(id)!;
  const spend = projectSpend(id);
  const sb = storyboardCostSummary(id);
  const rows = ledgerEntries({ projectId: id });
  const shots = listShots(id);
  const seq = Object.fromEntries(shots.map((s) => [s.id, s.seq]));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3 text-sm">
        <Card title="Project cap">{fmtUsd(p.budgetLimitUsd)}</Card>
        <Card title="Committed (incl. simulated)">{fmtUsd(spend.committed)}</Card>
        <Card title="Real spend">{fmtUsd(spend.real)}</Card>
        <Card title="Storyboard AI estimate">{fmtUsd(sb.estimatedUsd)}</Card>
      </div>
      <Card title="Ledger (reservation → charge/release)">
        <table className="w-full text-xs">
          <thead className="text-left text-muted">
            <tr>
              <th className="pb-1">When</th>
              <th>Type</th>
              <th>Category</th>
              <th>Shot</th>
              <th>Provider / model</th>
              <th className="text-right">Amount</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="py-1 text-muted">{r.createdAt.slice(0, 19).replace('T', ' ')}</td>
                <td>
                  {r.type} {r.simulated ? <Badge tone="mock">simulated</Badge> : null}
                </td>
                <td>{r.category}</td>
                <td>{r.shotId ? `#${seq[r.shotId] ?? '?'}` : '—'}</td>
                <td>{r.model}</td>
                <td className="text-right">{r.type === 'release' ? '−' : ''}{fmtUsd(r.amountUsd)}</td>
                <td className="text-muted">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
