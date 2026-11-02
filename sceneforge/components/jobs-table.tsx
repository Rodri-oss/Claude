import { ActionButton, Badge } from './ui';
import { fmtUsd } from '@/lib/format';
import type { Job } from '@/lib/jobs/queue';

export function JobsTable({ jobs, showProject }: { jobs: Job[]; showProject?: boolean }) {
  if (!jobs.length) return <div className="text-xs text-muted">No jobs.</div>;
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-muted">
        <tr>
          <th className="pb-1">Job</th>
          {showProject ? <th>Project</th> : null}
          <th>Kind</th>
          <th>Model</th>
          <th>State</th>
          <th>Progress</th>
          <th>Est.</th>
          <th>Actual</th>
          <th>Attempts</th>
          <th>Message</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {jobs.map((j) => (
          <tr key={j.id} className="border-t border-line align-top">
            <td className="py-1.5 font-mono text-[10px] text-muted">{j.id}</td>
            {showProject ? <td className="font-mono text-[10px] text-muted">{j.projectId}</td> : null}
            <td>{j.kind}</td>
            <td>
              {j.model} {j.simulatedCost ? <Badge tone="mock">simulated $</Badge> : null}
            </td>
            <td>
              <Badge tone={j.state}>{j.state}</Badge>
            </td>
            <td className="w-24">
              <div className="h-1.5 rounded bg-panel2">
                <div className="h-1.5 rounded bg-accent" style={{ width: `${Math.round(j.progress * 100)}%` }} />
              </div>
            </td>
            <td>{j.estimatedCostUsd ? fmtUsd(j.estimatedCostUsd) : '—'}</td>
            <td>{j.actualCostUsd !== null ? fmtUsd(j.actualCostUsd) : '—'}</td>
            <td>
              {j.attempts}/{j.maxAttempts}
            </td>
            <td className="max-w-xs text-muted">
              {j.message}
              {j.error && j.state !== 'COMPLETED' ? <div className="text-red-300">{j.errorClass}: {j.error}</div> : null}
            </td>
            <td className="whitespace-nowrap text-right">
              {['QUEUED', 'SUBMITTED', 'RUNNING', 'AWAITING_APPROVAL'].includes(j.state) ? (
                <ActionButton size="sm" variant="ghost" action="job.cancel" input={{ jobId: j.id }} confirm={j.state === 'SUBMITTED' || j.state === 'RUNNING' ? 'Cancel after submission? The provider may still bill — the estimate will be charged.' : undefined}>
                  Cancel
                </ActionButton>
              ) : null}
              {j.state === 'NEEDS_RECONCILIATION' ? (
                <div className="flex flex-col items-end gap-1">
                  <ActionButton size="sm" action="job.reconcile" input={{ jobId: j.id, action: 'check_provider' }}>
                    Check provider
                  </ActionButton>
                  <ActionButton size="sm" action="job.reconcile" input={{ jobId: j.id, action: 'not_billed_retry' }} confirm="Only choose this if you verified in the provider dashboard that the job was NOT billed. Resubmit?">
                    Not billed → retry
                  </ActionButton>
                  <ActionButton size="sm" action="job.reconcile" input={{ jobId: j.id, action: 'billed_failed' }}>
                    Billed, no output
                  </ActionButton>
                  <ActionButton size="sm" action="job.reconcile" input={{ jobId: j.id, action: 'cancel_not_billed' }}>
                    Not billed → cancel
                  </ActionButton>
                </div>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
