'use client';
import { useState } from 'react';
import { rpc } from '@/components/api';
import { ActionButton, Badge, fmtUsd, UploadButton } from '@/components/ui';

type J = { id: string; kind: string; model: string; shotId: string | null; est: number; breakdown: string; simulated: boolean; revision: boolean };

export function ApprovalPanel({ projectId, jobs, shotSeq }: { projectId: string; jobs: J[]; shotSeq: Record<string, number> }) {
  const [sel, setSel] = useState<string[]>(jobs.map((j) => j.id));
  const total = jobs.filter((j) => sel.includes(j.id)).reduce((a, j) => a + j.est, 0);
  if (!jobs.length) return <div className="text-sm text-muted">No generation jobs awaiting approval.</div>;
  return (
    <div className="space-y-2">
      <table className="w-full text-xs">
        <tbody>
          {jobs.map((j) => (
            <tr key={j.id} className="border-t border-line">
              <td className="w-6 py-1.5">
                <input type="checkbox" checked={sel.includes(j.id)} onChange={(e) => setSel(e.target.checked ? [...sel, j.id] : sel.filter((x) => x !== j.id))} />
              </td>
              <td>{j.shotId ? `Shot #${shotSeq[j.shotId] ?? '?'}` : '—'}</td>
              <td>{j.kind}</td>
              <td>{j.model}</td>
              <td>{j.breakdown}</td>
              <td>
                {j.revision ? <Badge tone="stale">revision</Badge> : null} {j.simulated ? <Badge tone="mock">simulated</Badge> : <Badge tone="FAILED">REAL CHARGE</Badge>}
              </td>
              <td className="text-right font-medium">{fmtUsd(j.est)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-end gap-2">
        <span className="text-sm">
          Selected total: <b>{fmtUsd(total)}</b>
        </span>
        <ActionButton variant="ghost" disabled={!sel.length} action="jobs.reject" input={() => ({ jobIds: sel })}>
          Reject selected
        </ActionButton>
        <ActionButton variant="success" disabled={!sel.length} action="jobs.approve" input={() => ({ projectId, jobIds: sel, note: 'Approved in Animation tab' })} confirm={`Approve ${sel.length} job(s) for ${fmtUsd(total)}?`} success="Approved — budget reserved, jobs queued">
          Approve {sel.length} job(s)
        </ActionButton>
      </div>
    </div>
  );
}

export function ReplaceShot({ shotId, projectId }: { shotId: string; projectId: string }) {
  return <UploadButton size="sm" category="video" projectId={projectId} accept="video/*,image/*" label="Replace…" onUploaded={(a) => rpc('shot.replace', { shotId, assetId: a.id })} />;
}
