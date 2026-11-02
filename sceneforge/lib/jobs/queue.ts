/**
 * Durable SQLite-backed job queue.
 *
 * State machine:
 *   DRAFT → AWAITING_APPROVAL → QUEUED → SUBMITTED → RUNNING → COMPLETED | FAILED | CANCELLED | NEEDS_RECONCILIATION
 *
 * Safety rules enforced here:
 *  - jobs with a non-zero estimate need an explicit generation approval whose scope lists the job id
 *  - the estimate is reserved in the budget ledger before submission; reconciled to actual afterwards
 *  - the job is marked SUBMITTED *before* the provider call; a crash mid-submit is detected on restart
 *  - ambiguous failures (may have been billed) are never retried automatically → NEEDS_RECONCILIATION
 *  - duplicate submissions are prevented by idempotency keys
 */
import fs from 'node:fs';
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { hashOf, newId, nowIso } from '../ids';
import { reserve, release, settle, checkBatch, BudgetError } from '../budget/service';
import { getModel, getProvider } from '../providers/registry';
import { ProviderError, type GenerationRequest, type NormalizedOutput } from '../providers/types';
import { TERMINAL_JOB_STATES, type BudgetCategory, type JobKind, type JobState } from '../types';

export type Job = typeof schema.generationJobs.$inferSelect;

export const LEASE_MS = 90_000;
const POLL_MS = Number(process.env.SCENEFORGE_POLL_MS ?? 1000);

// ---------------------------------------------------------------------------------------------
// Handlers (registered by lib/jobs/handlers.ts to avoid import cycles)
// ---------------------------------------------------------------------------------------------

export interface JobContext {
  progress(p: number, message?: string): void;
}
type LocalHandler = (job: Job, ctx: JobContext) => Promise<Record<string, unknown>>;
type ResultHandler = (job: Job, output: NormalizedOutput) => Promise<Record<string, unknown>>;
const localHandlers = new Map<string, LocalHandler>();
const resultHandlers = new Map<string, ResultHandler>();
export function registerLocalHandler(kind: JobKind, fn: LocalHandler) {
  localHandlers.set(kind, fn);
}
export function registerResultHandler(kind: JobKind, fn: ResultHandler) {
  resultHandlers.set(kind, fn);
}
const isLocalKind = (k: string) => k === 'render_preview' || k === 'export' || k === 'storyboard_frames';

// ---------------------------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------------------------

export interface CreateJobInput {
  projectId: string | null;
  shotId?: string | null;
  sceneId?: string | null;
  kind: JobKind;
  modelId?: string; // provider jobs
  request?: Omit<GenerationRequest, 'idempotencyKey' | 'modelId'>;
  input?: Record<string, unknown>; // local jobs
  isRevision?: boolean;
  /** extra discriminator for intentional new variations (otherwise identical requests dedupe) */
  variant?: number | string;
  budgetCategory?: BudgetCategory;
}

export function getJob(id: string): Job | undefined {
  return getDb().select().from(schema.generationJobs).where(eq(schema.generationJobs.id, id)).get();
}
export function requireJob(id: string): Job {
  const j = getJob(id);
  if (!j) throw new Error(`Job ${id} not found`);
  return j;
}

function setJob(id: string, patch: Partial<Job>) {
  getDb()
    .update(schema.generationJobs)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(schema.generationJobs.id, id))
    .run();
}

/** Create (or return the existing duplicate of) a job. */
export function createJob(input: CreateJobInput): { job: Job; duplicate: boolean } {
  const db = getDb();
  let provider = 'local';
  let model: string = input.kind;
  let estimate = 0;
  let simulated = false;
  let paid = false;
  let payload: Record<string, unknown> = input.input ?? {};
  if (!isLocalKind(input.kind)) {
    if (!input.modelId || !input.request) throw new Error('Provider jobs need modelId and request');
    const { adapter, caps } = getModel(input.modelId);
    const conf = adapter.isConfigured();
    if (!conf.ok) throw new ProviderError(`${adapter.label}: ${conf.reason}`, 'not_configured', 'no');
    provider = caps.provider;
    model = caps.id;
    paid = caps.paid;
    const est = adapter.estimateCost({ ...input.request, modelId: caps.id, idempotencyKey: '' } as GenerationRequest);
    estimate = est.usd;
    simulated = est.simulated;
    payload = { ...(input.input ?? {}), request: input.request, estimateBreakdown: est.breakdown };
  }
  const key = hashOf({ k: input.kind, s: input.shotId ?? null, m: model, p: payload, v: input.variant ?? null, pj: input.projectId });
  return db.transaction(
    (tx) => {
      const existing = tx
        .select()
        .from(schema.generationJobs)
        .where(eq(schema.generationJobs.idempotencyKey, key))
        .orderBy(desc(schema.generationJobs.createdAt))
        .all()
        .find((j) => j.state !== 'FAILED' && j.state !== 'CANCELLED');
      if (existing) return { job: existing, duplicate: true };
      const id = newId('job');
      const needsApproval = estimate > 0;
      tx.insert(schema.generationJobs)
        .values({
          id,
          projectId: input.projectId,
          shotId: input.shotId ?? null,
          sceneId: input.sceneId ?? null,
          kind: input.kind,
          provider,
          model,
          input: payload,
          state: needsApproval ? 'AWAITING_APPROVAL' : 'QUEUED',
          idempotencyKey: key,
          isRevision: input.isRevision ?? false,
          paid,
          simulatedCost: simulated,
          budgetCategory: input.budgetCategory ?? (input.kind === 'video' ? 'video' : input.kind === 'image' ? 'image' : input.kind === 'tts' ? 'audio' : 'llm'),
          estimatedCostUsd: estimate,
          maxAttempts: 3,
          message: needsApproval ? `Estimated $${estimate.toFixed(2)}${simulated ? ' (simulated)' : ''} — awaiting generation approval` : 'Queued',
        })
        .run();
      return { job: tx.select().from(schema.generationJobs).where(eq(schema.generationJobs.id, id)).get()!, duplicate: false };
    },
    { behavior: 'immediate' },
  );
}

// ---------------------------------------------------------------------------------------------
// Approval (Checkpoint 4) — approving a batch reserves its budget. It is NOT open-ended permission:
// the approval scope lists exact job ids and a max amount.
// ---------------------------------------------------------------------------------------------

export function approveJobs(projectId: string, jobIds: string[], note = '') {
  if (!jobIds.length) throw new Error('No jobs selected');
  const db = getDb();
  const jobs = db.select().from(schema.generationJobs).where(inArray(schema.generationJobs.id, jobIds)).all();
  if (jobs.length !== jobIds.length) throw new Error('Some jobs were not found');
  for (const j of jobs) {
    if (j.projectId !== projectId) throw new Error(`Job ${j.id} belongs to another project`);
    if (j.state !== 'AWAITING_APPROVAL') throw new Error(`Job ${j.id} is ${j.state}, not awaiting approval`);
  }
  const total = Math.round(jobs.reduce((a, j) => a + j.estimatedCostUsd, 0) * 100) / 100;
  checkBatch(total);
  const reserved: string[] = [];
  try {
    for (const j of jobs) {
      reserve({
        jobId: j.id,
        projectId: j.projectId,
        sceneId: j.sceneId,
        shotId: j.shotId,
        category: j.budgetCategory as BudgetCategory,
        amountUsd: j.estimatedCostUsd,
        provider: j.provider,
        model: j.model,
        simulated: j.simulatedCost,
        isRevision: j.isRevision,
      });
      reserved.push(j.id);
    }
  } catch (e) {
    for (const id of reserved) release(id, 'Batch approval rolled back');
    throw e;
  }
  const approvalId = newId('apr');
  db.transaction((tx) => {
    tx.insert(schema.approvals)
      .values({ id: approvalId, projectId, checkpoint: 'generation', decision: 'approved', scope: { jobIds, maxAmountUsd: total, shotIds: [...new Set(jobs.map((j) => j.shotId).filter(Boolean))] as string[] }, amountUsd: total, note })
      .run();
    for (const j of jobs) tx.update(schema.generationJobs).set({ state: 'QUEUED', approvalId, message: 'Approved — queued', updatedAt: nowIso() }).where(eq(schema.generationJobs.id, j.id)).run();
  });
  return { approvalId, totalUsd: total };
}

export function rejectJobs(jobIds: string[]) {
  for (const id of jobIds) {
    const j = requireJob(id);
    if (j.state === 'AWAITING_APPROVAL' || j.state === 'DRAFT') setJob(id, { state: 'CANCELLED', message: 'Rejected at approval' });
  }
}

function approvalCovers(job: Job): boolean {
  if (job.estimatedCostUsd <= 0) return true;
  if (!job.approvalId) return false;
  const a = getDb().select().from(schema.approvals).where(eq(schema.approvals.id, job.approvalId)).get();
  return !!a && a.decision === 'approved' && a.checkpoint === 'generation' && (a.scope.jobIds ?? []).includes(job.id) && job.estimatedCostUsd <= (a.scope.maxAmountUsd ?? 0) + 1e-9;
}

function hasReservation(jobId: string) {
  return !!getDb()
    .select()
    .from(schema.budgetLedger)
    .where(and(eq(schema.budgetLedger.jobId, jobId), eq(schema.budgetLedger.type, 'reservation')))
    .get();
}

// ---------------------------------------------------------------------------------------------
// Worker side
// ---------------------------------------------------------------------------------------------

const ACTIVE: JobState[] = ['QUEUED', 'SUBMITTED', 'RUNNING'];

export const RENDER_KINDS = ['export', 'render_preview', 'storyboard_frames'];

export function claimNext(workerId: string, lane: 'all' | 'render' | 'generation' = 'all'): Job | null {
  const db = getDb();
  return db.transaction(
    (tx) => {
      const now = nowIso();
      const staleBefore = new Date(Date.now() - LEASE_MS).toISOString();
      const laneCond =
        lane === 'render' ? inArray(schema.generationJobs.kind, RENDER_KINDS) : lane === 'generation' ? sql`${schema.generationJobs.kind} not in ('export','render_preview','storyboard_frames')` : undefined;
      const job = tx
        .select()
        .from(schema.generationJobs)
        .where(
          and(
            laneCond,
            inArray(schema.generationJobs.state, ACTIVE),
            or(isNull(schema.generationJobs.lockedBy), lte(schema.generationJobs.lockedAt, staleBefore)),
            or(isNull(schema.generationJobs.nextRunAt), lte(schema.generationJobs.nextRunAt, now)),
          ),
        )
        .orderBy(asc(schema.generationJobs.nextRunAt), asc(schema.generationJobs.createdAt))
        .limit(1)
        .get();
      if (!job) return null;
      tx.update(schema.generationJobs).set({ lockedBy: workerId, lockedAt: now }).where(eq(schema.generationJobs.id, job.id)).run();
      return { ...job, lockedBy: workerId, lockedAt: now };
    },
    { behavior: 'immediate' },
  );
}

function unlock(id: string, patch: Partial<Job> = {}) {
  setJob(id, { ...patch, lockedBy: null, lockedAt: null });
}

/** Release locks held by worker processes on this host that are no longer alive (fast restart recovery). */
export function recoverDeadWorkerLocks(host: string) {
  const db = getDb();
  const locked = db.select().from(schema.generationJobs).where(and(inArray(schema.generationJobs.state, ACTIVE), sql`${schema.generationJobs.lockedBy} is not null`)).all();
  let n = 0;
  for (const j of locked) {
    const [h, pidStr] = (j.lockedBy ?? '').split(':');
    const pid = Number(pidStr);
    if (h !== host || !pid) continue;
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch {
      alive = false;
    }
    if (!alive || pid === process.pid) {
      db.update(schema.generationJobs).set({ lockedBy: null, lockedAt: null }).where(eq(schema.generationJobs.id, j.id)).run();
      n++;
    }
  }
  return n;
}

/** On worker start: release locks held by dead workers. Jobs stay in their state and are resumed. */
export function recoverStaleLocks(force = false) {
  const db = getDb();
  const before = force ? nowIso() : new Date(Date.now() - LEASE_MS).toISOString();
  const r = db
    .update(schema.generationJobs)
    .set({ lockedBy: null, lockedAt: null })
    .where(and(inArray(schema.generationJobs.state, ACTIVE), lte(schema.generationJobs.lockedAt, before)))
    .run();
  return r.changes;
}

function newAttempt(job: Job, phase: string, request?: Record<string, unknown>) {
  const id = newId('att');
  getDb().insert(schema.generationAttempts).values({ id, jobId: job.id, attemptNo: job.attempts, phase, request: request ?? null }).run();
  return id;
}
function updateAttempt(id: string, patch: Partial<typeof schema.generationAttempts.$inferInsert>) {
  getDb().update(schema.generationAttempts).set(patch).where(eq(schema.generationAttempts.id, id)).run();
}
function latestAttempt(jobId: string) {
  return getDb().select().from(schema.generationAttempts).where(eq(schema.generationAttempts.jobId, jobId)).orderBy(desc(schema.generationAttempts.attemptNo), desc(schema.generationAttempts.startedAt)).get();
}

const providerKey = (job: Job, attemptNo: number) => `${job.idempotencyKey}:${attemptNo}`;

function buildRequest(job: Job, attemptNo: number): GenerationRequest {
  const req = (job.input as { request: GenerationRequest }).request;
  return { ...req, modelId: job.model, idempotencyKey: providerKey(job, attemptNo) };
}

function fail(job: Job, err: ProviderError | Error, opts: { release: boolean }) {
  const pe = err instanceof ProviderError ? err : null;
  if (opts.release) release(job.id, `Released: ${pe?.errorClass ?? 'error'} (not billed)`);
  unlock(job.id, { state: 'FAILED', error: err.message, errorClass: pe?.errorClass ?? 'unknown', message: `Failed: ${err.message}` });
}

function needsReconciliation(job: Job, err: Error | string) {
  const msg = typeof err === 'string' ? err : err.message;
  unlock(job.id, { state: 'NEEDS_RECONCILIATION', error: msg, errorClass: 'ambiguous', message: `Needs reconciliation: ${msg}. Not retried automatically (may have been billed).` });
}

export async function processJob(job: Job, workerId: string): Promise<void> {
  const ctx: JobContext = {
    progress: (p, message) => setJob(job.id, { progress: Math.max(0, Math.min(1, p)), message: message ?? job.message, lockedAt: nowIso(), lockedBy: workerId }),
  };
  try {
    if (isLocalKind(job.kind)) return await processLocal(job, ctx);
    return await processProvider(job);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const cur = getJob(job.id) ?? job;
    // Unexpected internal errors: never auto-retry provider calls blindly.
    if (!isLocalKind(cur.kind) && (cur.state === 'SUBMITTED' || cur.state === 'RUNNING')) needsReconciliation(cur, `Internal error after submission: ${err.message}`);
    else fail(cur, err, { release: cur.state === 'QUEUED' && !isLocalKind(cur.kind) });
  }
}

async function processLocal(job: Job, ctx: JobContext) {
  const handler = localHandlers.get(job.kind);
  if (!handler) throw new Error(`No handler for job kind ${job.kind}`);
  setJob(job.id, { state: 'RUNNING', attempts: job.attempts + 1, progress: 0, message: 'Running' });
  const att = newAttempt({ ...job, attempts: job.attempts + 1 }, 'running');
  try {
    const result = await handler(job, ctx);
    updateAttempt(att, { phase: 'succeeded', response: result, finishedAt: nowIso() });
    unlock(job.id, { state: 'COMPLETED', progress: 1, result, message: 'Completed', error: null });
  } catch (e) {
    const err = e as Error & { errorClass?: string };
    updateAttempt(att, { phase: 'failed', error: err.message, errorClass: err.errorClass ?? 'unknown', finishedAt: nowIso() });
    unlock(job.id, { state: 'FAILED', error: err.message, errorClass: err.errorClass ?? 'render_failed', message: `Failed: ${err.message}` });
  }
}

async function processProvider(job: Job) {
  const adapter = getProvider(job.provider);

  if (job.state === 'QUEUED') {
    // Re-check approval + reservation at submission time (defence in depth).
    if (!approvalCovers(job)) return unlock(job.id, { state: 'AWAITING_APPROVAL', message: 'No valid generation approval covers this job' });
    if (job.estimatedCostUsd > 0 && !hasReservation(job.id)) return unlock(job.id, { state: 'AWAITING_APPROVAL', message: 'Budget reservation missing — re-approve' });
    const attemptNo = job.attempts + 1;
    const req = buildRequest(job, attemptNo);
    // Mark SUBMITTED before calling the provider; if we crash mid-call, restart sees SUBMITTED w/o provider id → reconcile.
    setJob(job.id, { state: 'SUBMITTED', attempts: attemptNo, providerJobId: null, message: 'Submitting to provider' });
    const att = newAttempt({ ...job, attempts: attemptNo }, 'submitting', { ...req, keyframe: undefined });
    try {
      const { providerJobId } = await adapter.submit(req);
      updateAttempt(att, { phase: 'submitted', providerJobId });
      unlock(job.id, { providerJobId, state: 'SUBMITTED', message: 'Submitted', nextRunAt: new Date(Date.now() + POLL_MS).toISOString() });
    } catch (e) {
      const pe = adapter.classifyError(e);
      updateAttempt(att, { phase: 'failed', error: pe.message, errorClass: pe.errorClass, finishedAt: nowIso() });
      if (pe.errorClass === 'ambiguous' || pe.billed === 'unknown' || pe.billed === 'yes') return needsReconciliation(job, pe);
      if (pe.retryable && attemptNo < job.maxAttempts) {
        const backoff = pe.retryAfterMs ?? Math.min(60_000, 2000 * 2 ** (attemptNo - 1));
        return unlock(job.id, { state: 'QUEUED', error: pe.message, errorClass: pe.errorClass, message: `Retrying (${pe.errorClass}) — attempt ${attemptNo + 1}/${job.maxAttempts}`, nextRunAt: new Date(Date.now() + backoff).toISOString() });
      }
      return fail(job, pe, { release: true });
    }
    return;
  }

  if (job.state === 'SUBMITTED' && !job.providerJobId) {
    // Crash or ambiguous error during submit. Ask the provider whether it accepted the job.
    const att = latestAttempt(job.id);
    const key = providerKey(job, att?.attemptNo ?? job.attempts);
    if (!adapter.reconcile) return needsReconciliation(job, 'Interrupted during submission and provider has no lookup');
    const r = await adapter.reconcile(key);
    if (r.found && r.providerJobId) {
      if (att) updateAttempt(att.id, { phase: 'reconciled', providerJobId: r.providerJobId });
      return unlock(job.id, { providerJobId: r.providerJobId, message: 'Recovered provider job after interruption', nextRunAt: nowIso() });
    }
    // Provider confirms it never accepted it → safe to submit again (counts as an attempt).
    if (job.attempts < job.maxAttempts) return unlock(job.id, { state: 'QUEUED', message: 'Provider has no record of the interrupted submission — resubmitting' });
    return fail(job, new Error('Submission interrupted repeatedly'), { release: true });
  }

  if ((job.state === 'SUBMITTED' || job.state === 'RUNNING') && job.providerJobId) {
    const st = await adapter.status(job.providerJobId);
    if (st.status === 'queued' || st.status === 'running') {
      return unlock(job.id, { state: st.status === 'running' ? 'RUNNING' : 'SUBMITTED', progress: st.progress ?? job.progress, message: st.status === 'running' ? 'Generating…' : 'In provider queue', nextRunAt: new Date(Date.now() + POLL_MS).toISOString() });
    }
    if (st.status === 'failed') {
      const pe = st.error ?? new ProviderError('Provider reported failure', 'provider_failed', 'unknown');
      const att = latestAttempt(job.id);
      if (att) updateAttempt(att.id, { phase: 'failed', error: pe.message, errorClass: pe.errorClass, finishedAt: nowIso() });
      if (pe.billed !== 'no') return needsReconciliation(job, pe);
      if (job.attempts < job.maxAttempts) return unlock(job.id, { state: 'QUEUED', providerJobId: null, error: pe.message, errorClass: pe.errorClass, message: `Provider failed (not billed) — retrying attempt ${job.attempts + 1}/${job.maxAttempts}` });
      return fail(job, pe, { release: true });
    }
    // succeeded → fetch + normalize + import
    let output: NormalizedOutput;
    try {
      output = await adapter.result(job.providerJobId);
    } catch (e) {
      const pe = adapter.classifyError(e);
      const fetchFailures = Number((job.result as { fetchFailures?: number } | null)?.fetchFailures ?? 0) + 1;
      if ((pe.errorClass === 'expired_media' || pe.errorClass === 'transient' || pe.errorClass === 'timeout') && fetchFailures < 4) {
        // Re-fetching a finished result never creates a new (billable) generation.
        return unlock(job.id, { result: { fetchFailures }, message: `Result download failed (${pe.errorClass}); retrying download`, nextRunAt: new Date(Date.now() + POLL_MS * fetchFailures).toISOString() });
      }
      return needsReconciliation(job, `Generation finished but result could not be downloaded: ${pe.message}`);
    }
    for (const f of output.files) if (!fs.existsSync(f.path) || fs.statSync(f.path).size === 0) return needsReconciliation(job, 'Provider returned an empty/partial file');
    const handler = resultHandlers.get(job.kind);
    const result = handler ? await handler(job, output) : {};
    const actual = output.actualCostUsd ?? job.estimatedCostUsd;
    if (job.estimatedCostUsd > 0 || actual > 0)
      settle(job.id, actual, output.costSource === 'provider' ? 'Provider-reported cost' : 'Provider did not report cost — settled at estimate (verify against provider billing)');
    const att = latestAttempt(job.id);
    if (att) updateAttempt(att.id, { phase: 'succeeded', response: { files: output.files.length, mock: output.mock, meta: output.meta }, finishedAt: nowIso() });
    return unlock(job.id, { state: 'COMPLETED', progress: 1, actualCostUsd: actual, result: { ...result, mock: output.mock, costSource: output.costSource }, message: output.mock ? 'Completed (MOCK output)' : 'Completed', error: null, errorClass: null });
  }

  unlock(job.id);
}

/** Process at most one job. Returns true if a job was processed. */
export async function processOne(workerId: string, lane: 'all' | 'render' | 'generation' = 'all'): Promise<boolean> {
  const job = claimNext(workerId, lane);
  if (!job) return false;
  await processJob(job, workerId);
  return true;
}

/** Drain the queue (tests/scripts). */
export async function drain(workerId = 'drain', timeoutMs = 120_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const did = await processOne(workerId);
    if (!did) {
      const pending = getDb()
        .select({ n: sql<number>`count(*)` })
        .from(schema.generationJobs)
        .where(inArray(schema.generationJobs.state, ACTIVE))
        .get();
      if (!pending?.n) return;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw new Error('drain timed out');
}

// ---------------------------------------------------------------------------------------------
// User actions
// ---------------------------------------------------------------------------------------------

export function cancelJob(id: string) {
  const job = requireJob(id);
  if (TERMINAL_JOB_STATES.includes(job.state)) return job;
  if (job.state === 'SUBMITTED' || job.state === 'RUNNING') {
    // Provider may still complete & bill: keep the reservation as a conservative charge.
    if (job.estimatedCostUsd > 0) settle(id, job.estimatedCostUsd, 'Cancelled after submission — charged at estimate (verify with provider)');
  } else release(id, 'Cancelled before submission');
  unlock(id, { state: 'CANCELLED', message: 'Cancelled by user' });
  return requireJob(id);
}

/** Resolve a NEEDS_RECONCILIATION job after the user checked the provider dashboard. */
export async function resolveReconciliation(id: string, action: 'check_provider' | 'not_billed_retry' | 'billed_failed' | 'cancel_not_billed') {
  const job = requireJob(id);
  if (job.state !== 'NEEDS_RECONCILIATION') throw new Error('Job does not need reconciliation');
  const adapter = getProvider(job.provider);
  if (action === 'check_provider') {
    if (!adapter.reconcile) throw new Error('Provider has no lookup — check its dashboard and choose a manual resolution');
    const att = latestAttempt(id);
    const r = await adapter.reconcile(providerKey(job, att?.attemptNo ?? job.attempts));
    if (r.found && r.providerJobId) {
      setJob(id, { state: 'RUNNING', providerJobId: r.providerJobId, message: 'Reconciled: provider job found — resuming', nextRunAt: nowIso(), lockedBy: null });
      return requireJob(id);
    }
    setJob(id, { message: 'Provider has no record of this job. Choose "Not billed — retry" or cancel.' });
    return requireJob(id);
  }
  if (action === 'not_billed_retry') {
    if (job.attempts >= job.maxAttempts) setJob(id, { maxAttempts: job.attempts + 1 });
    setJob(id, { state: 'QUEUED', providerJobId: null, message: 'User confirmed not billed — resubmitting under the same approval', lockedBy: null, nextRunAt: null });
  }
  if (action === 'billed_failed') {
    settle(id, job.estimatedCostUsd, 'User confirmed billed without usable output');
    setJob(id, { state: 'FAILED', message: 'Marked billed + failed by user', lockedBy: null });
  }
  if (action === 'cancel_not_billed') {
    release(id, 'User confirmed not billed');
    setJob(id, { state: 'CANCELLED', message: 'Cancelled (not billed)', lockedBy: null });
  }
  return requireJob(id);
}

export function listJobs(filter: { projectId?: string; states?: JobState[]; shotId?: string; limit?: number } = {}) {
  const conds = [];
  if (filter.projectId) conds.push(eq(schema.generationJobs.projectId, filter.projectId));
  if (filter.shotId) conds.push(eq(schema.generationJobs.shotId, filter.shotId));
  if (filter.states?.length) conds.push(inArray(schema.generationJobs.state, filter.states));
  return getDb()
    .select()
    .from(schema.generationJobs)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.generationJobs.createdAt))
    .limit(filter.limit ?? 200)
    .all();
}

export function jobAttempts(jobId: string) {
  return getDb().select().from(schema.generationAttempts).where(eq(schema.generationAttempts.jobId, jobId)).orderBy(asc(schema.generationAttempts.startedAt)).all();
}

export { BudgetError };
