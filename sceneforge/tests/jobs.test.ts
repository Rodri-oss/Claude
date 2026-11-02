import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { approveCheckpoint } from '@/lib/approvals/service';
import { listShots, updateShot, requestStartImage } from '@/lib/shots/service';
import { approveJobs, createJob, drain, getJob, jobAttempts, recoverDeadWorkerLocks, recoverStaleLocks, resolveReconciliation, claimNext, cancelJob } from '@/lib/jobs/queue';
import { ledgerEntries } from '@/lib/budget/service';
import { makeApprovedProject } from './fixtures';

async function bShot(pid: string, i: number, scenario?: string) {
  const s = listShots(pid)[i];
  updateShot(s.id, { mode: 'B', generation: { quality: 'draft', mockScenario: scenario } });
  approveCheckpoint(pid, 'storyboard');
  return s.id;
}
const ledger = (jobId: string) => ledgerEntries({}).filter((r) => r.jobId === jobId).map((r) => `${r.type}:${r.amountUsd}`).sort();

describe('job reliability', () => {
  it('prevents duplicate submissions; a new job is allowed only after failure or an explicit variant', async () => {
    const pid = await makeApprovedProject();
    const sid = await bShot(pid, 1);
    const a = requestStartImage(sid);
    const b = requestStartImage(sid);
    expect(b.duplicate).toBe(true);
    expect(b.job.id).toBe(a.job.id);
    const c = requestStartImage(sid, { regenerate: true, variant: 2 });
    expect(c.duplicate).toBe(false);
    expect(c.job.isRevision).toBe(true);
  });

  it('completes an approved job end-to-end and reconciles estimate vs actual', async () => {
    const pid = await makeApprovedProject();
    const sid = await bShot(pid, 1);
    const { job } = requestStartImage(sid);
    approveJobs(pid, [job.id]);
    await drain();
    const done = getJob(job.id)!;
    expect(done.state).toBe('COMPLETED');
    expect(done.actualCostUsd).toBe(0.04);
    expect(ledger(job.id)).toEqual(['charge:0.04', 'release:0.04', 'reservation:0.04']);
    expect(listShots(pid).find((s) => s.id === sid)!.startImageVersionId).toBeTruthy();
  });

  it('auto-retries safe (unbilled) transient failures within the same approval', async () => {
    const pid = await makeApprovedProject();
    const sid = await bShot(pid, 1, 'fail-transient');
    const { job } = requestStartImage(sid);
    approveJobs(pid, [job.id]);
    await drain();
    const j = getJob(job.id)!;
    expect(j.state).toBe('COMPLETED');
    expect(j.attempts).toBe(2);
    expect(jobAttempts(job.id).map((a) => a.phase)).toEqual(['failed', 'succeeded']);
  });

  it('fails invalid input permanently and releases the reservation', async () => {
    const pid = await makeApprovedProject();
    const sid = await bShot(pid, 1, 'fail-invalid');
    const { job } = requestStartImage(sid);
    approveJobs(pid, [job.id]);
    await drain();
    expect(getJob(job.id)!.state).toBe('FAILED');
    expect(getJob(job.id)!.attempts).toBe(1);
    expect(ledger(job.id)).toEqual(['release:0.04', 'reservation:0.04']);
  });

  it('never auto-retries an ambiguous failure; reconciliation finds the provider job and resumes', async () => {
    const pid = await makeApprovedProject();
    const sid = await bShot(pid, 1, 'fail-ambiguous');
    const { job } = requestStartImage(sid);
    approveJobs(pid, [job.id]);
    await drain();
    expect(getJob(job.id)!.state).toBe('NEEDS_RECONCILIATION');
    expect(getJob(job.id)!.attempts).toBe(1);
    await resolveReconciliation(job.id, 'check_provider');
    await drain();
    expect(getJob(job.id)!.state).toBe('COMPLETED');
    expect(getJob(job.id)!.attempts).toBe(1); // no second paid submission
  });

  it('re-downloads expired media without resubmitting the generation', async () => {
    const pid = await makeApprovedProject();
    const sid = await bShot(pid, 1, 'expired-media');
    const { job } = requestStartImage(sid);
    approveJobs(pid, [job.id]);
    await drain();
    expect(getJob(job.id)!.state).toBe('COMPLETED');
    expect(getJob(job.id)!.attempts).toBe(1);
  });

  it('recovers after a crash mid-submit: dead worker locks released, job reconciled instead of resubmitted', async () => {
    const pid = await makeApprovedProject();
    const sid = await bShot(pid, 1);
    const { job } = requestStartImage(sid);
    approveJobs(pid, [job.id]);
    // Simulate: worker (pid 999999, dead) submitted to the provider, then crashed before saving the provider id.
    const { mockProvider } = await import('@/lib/providers/mock');
    const req = (getJob(job.id)!.input as { request: Record<string, unknown> }).request;
    await mockProvider.submit({ ...(req as object), modelId: 'mock/image', idempotencyKey: `${job.idempotencyKey}:1` } as never);
    getDb().update(schema.generationJobs).set({ state: 'SUBMITTED', attempts: 1, providerJobId: null, lockedBy: 'testhost:999999', lockedAt: new Date().toISOString() }).where(eq(schema.generationJobs.id, job.id)).run();
    getDb().insert(schema.generationAttempts).values({ id: 'att_crash', jobId: job.id, attemptNo: 1, phase: 'submitting' }).run();
    expect(claimNext('w2')).toBeNull(); // still locked by the "dead" worker
    expect(recoverDeadWorkerLocks('testhost')).toBe(1);
    await drain('w2');
    const j = getJob(job.id)!;
    expect(j.state).toBe('COMPLETED');
    expect(j.attempts).toBe(1);
    expect(j.message).toMatch(/Completed/);
    expect(recoverStaleLocks()).toBe(0);
  });

  it('cancels before submission with a full refund', async () => {
    const pid = await makeApprovedProject();
    const sid = await bShot(pid, 1);
    const { job } = requestStartImage(sid);
    approveJobs(pid, [job.id]);
    cancelJob(job.id);
    expect(getJob(job.id)!.state).toBe('CANCELLED');
    expect(ledger(job.id)).toEqual(['release:0.04', 'reservation:0.04']);
    void createJob;
  });
});
