import { listJobs } from '@/lib/jobs/queue';
import { Card } from '@/components/ui';
import { JobsTable } from '@/components/jobs-table';

export const dynamic = 'force-dynamic';

export default function Jobs() {
  const attention = listJobs({ states: ['NEEDS_RECONCILIATION', 'AWAITING_APPROVAL'] });
  const active = listJobs({ states: ['QUEUED', 'SUBMITTED', 'RUNNING'] });
  const done = listJobs({ states: ['COMPLETED', 'FAILED', 'CANCELLED'], limit: 60 });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Jobs</h1>
      <p className="text-xs text-muted">Jobs are processed by the worker (`npm run worker`) and survive restarts. Refresh to update.</p>
      <Card title={`Needs attention (${attention.length})`}>
        <JobsTable jobs={attention} showProject />
      </Card>
      <Card title={`Active (${active.length})`}>
        <JobsTable jobs={active} showProject />
      </Card>
      <Card title="Recent">
        <JobsTable jobs={done} showProject />
      </Card>
    </div>
  );
}
