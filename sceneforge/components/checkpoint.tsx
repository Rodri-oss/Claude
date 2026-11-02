import { checkpointStatus } from '@/lib/approvals/service';
import { ActionButton, Badge } from './ui';
import type { Checkpoint } from '@/lib/types';

const TEXT: Record<string, string> = {
  story: 'Checkpoint 1 — Story approval: script and scene breakdown',
  art: 'Checkpoint 2 — Art approval: characters, backgrounds and style',
  storyboard: 'Checkpoint 3 — Storyboard approval: shot structure and estimated cost',
  final: 'Checkpoint 5 — Final review: the complete production before export',
};

export function CheckpointBar({ projectId, checkpoint, note }: { projectId: string; checkpoint: Exclude<Checkpoint, 'generation'>; note?: string }) {
  const s = checkpointStatus(projectId, checkpoint);
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${s.state === 'approved' ? 'border-emerald-500/30 bg-emerald-500/5' : s.state === 'stale' ? 'border-amber-500/40 bg-amber-500/5' : 'border-line bg-panel'}`}>
      <div>
        <div className="text-sm font-medium">{TEXT[checkpoint]}</div>
        <div className="text-xs text-muted">
          <Badge tone={s.state}>{s.state}</Badge>{' '}
          {s.state === 'stale' ? 'Content changed after approval — review and re-approve.' : s.approval ? `Last decision ${s.approval.createdAt.slice(0, 16).replace('T', ' ')}${s.approval.note ? ` — ${s.approval.note}` : ''}` : note ?? 'Not yet approved.'}
        </div>
      </div>
      <div className="flex gap-2">
        {s.state !== 'approved' ? (
          <ActionButton variant="success" action="checkpoint.approve" input={{ projectId, checkpoint }} success={`${checkpoint} approved`}>
            Approve
          </ActionButton>
        ) : (
          <ActionButton variant="ghost" action="checkpoint.revoke" input={{ projectId, checkpoint, note: 'Revoked by user' }} confirm="Revoke this approval? Later stages will be blocked until re-approved.">
            Revoke
          </ActionButton>
        )}
        {s.state !== 'rejected' && s.state !== 'approved' ? (
          <ActionButton variant="ghost" action="checkpoint.reject" input={{ projectId, checkpoint, note: 'Needs changes' }}>
            Request changes
          </ActionButton>
        ) : null}
      </div>
    </div>
  );
}
