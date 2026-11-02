import { afterEach, describe, expect, it } from 'vitest';
import { checkSpend, reserve, settle, release, budgetSummary, updateBudgetSettings, BudgetError, checkBatch, projectSpend } from '@/lib/budget/service';
import { createProject } from '@/lib/story/service';
import { approveJobs, createJob, listJobs } from '@/lib/jobs/queue';
import { listShots, updateShot, requestStartImage } from '@/lib/shots/service';
import { makeApprovedProject } from './fixtures';

const base = { projectId: null, category: 'video' as const, provider: 'mock', model: 'mock/x', simulated: true };
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as BudgetError).code;
  }
  return 'ok';
};

afterEach(() => {
  delete process.env.SCENEFORGE_ALLOW_PAID_PROVIDERS;
});

describe('budget caps and ledger', () => {
  it('enforces the monthly cap minus the revision reserve, and lets revisions use the reserve', () => {
    updateBudgetSettings({ monthlyLimitUsd: 150, reserveUsd: 20, perShotLimitUsd: 400, perSceneLimitUsd: 400 });
    reserve({ ...base, jobId: 'j1', amountUsd: 125 });
    expect(code(() => checkSpend({ ...base, amountUsd: 6 }))).toBe('monthly_cap');
    expect(code(() => checkSpend({ ...base, amountUsd: 5 }))).toBe('ok');
    expect(code(() => checkSpend({ ...base, amountUsd: 20, isRevision: true }))).toBe('ok');
    expect(code(() => checkSpend({ ...base, amountUsd: 26, isRevision: true }))).toBe('monthly_cap');
  });

  it('reserve → settle releases the reservation and records the actual charge; release refunds unbilled', () => {
    reserve({ ...base, jobId: 'j2', amountUsd: 2 });
    reserve({ ...base, jobId: 'j2', amountUsd: 2 }); // idempotent
    const s0 = budgetSummary();
    settle('j2', 1.25);
    settle('j2', 1.25); // idempotent
    const s1 = budgetSummary();
    expect(s1.committed - s0.committed).toBeCloseTo(-0.75, 5);
    reserve({ ...base, jobId: 'j3', amountUsd: 3 });
    release('j3');
    expect(budgetSummary().committed).toBeCloseTo(s1.committed, 5);
  });

  it('enforces project, scene, shot, generation-count and batch caps', () => {
    updateBudgetSettings({ monthlyLimitUsd: 400, reserveUsd: 0, perSceneLimitUsd: 5, perShotLimitUsd: 3, maxGenerationsPerShot: 2, maxBatchUsd: 4 });
    const p = createProject({ title: 'Caps', budgetLimitUsd: 10 });
    const b = { ...base, projectId: p.id };
    reserve({ ...b, jobId: 'p1', amountUsd: 9 });
    expect(code(() => checkSpend({ ...b, amountUsd: 2 }))).toBe('project_cap');
    expect(code(() => checkSpend({ ...base, sceneId: 'sc', amountUsd: 6 }))).toBe('scene_cap');
    expect(code(() => checkSpend({ ...base, shotId: 'sh', amountUsd: 4 }))).toBe('shot_cap');
    reserve({ ...base, shotId: 'sh2', jobId: 'g1', amountUsd: 0.1 });
    reserve({ ...base, shotId: 'sh2', jobId: 'g2', amountUsd: 0.1 });
    expect(code(() => checkSpend({ ...base, shotId: 'sh2', amountUsd: 0.1 }))).toBe('shot_generation_limit');
    expect(code(() => checkBatch(4.01))).toBe('batch_cap');
    expect(projectSpend(p.id).committed).toBe(9);
  });

  it('blocks real paid jobs unless explicitly enabled, and the kill switch blocks them even then', () => {
    expect(code(() => checkSpend({ ...base, simulated: false, amountUsd: 1 }))).toBe('paid_disabled');
    process.env.SCENEFORGE_ALLOW_PAID_PROVIDERS = 'true';
    updateBudgetSettings({ killSwitch: true });
    expect(code(() => checkSpend({ ...base, simulated: false, amountUsd: 1 }))).toBe('kill_switch');
    updateBudgetSettings({ killSwitch: false });
  });

  it('rejects allocations that do not sum to 100%', () => {
    expect(() => updateBudgetSettings({ allocations: { video: 0.5, image: 0.1 } })).toThrow(/100%/);
  });

  it('rolls back the whole batch when one job would exceed a cap', async () => {
    updateBudgetSettings({ monthlyLimitUsd: 400, reserveUsd: 0, perShotLimitUsd: 400, perSceneLimitUsd: 400, maxBatchUsd: 400, maxGenerationsPerShot: 50 });
    const pid = await makeApprovedProject();
    const shots = listShots(pid).slice(0, 3);
    for (const s of shots) updateShot(s.id, { mode: 'B' });
    (await import('@/lib/approvals/service')).approveCheckpoint(pid, 'storyboard');
    const ids = shots.map((s) => requestStartImage(s.id).job.id);
    const { getDb, schema } = await import('@/lib/db');
    const { eq } = await import('drizzle-orm');
    getDb().update(schema.projects).set({ budgetLimitUsd: 0.1 }).where(eq(schema.projects.id, pid)).run(); // only 2 × $0.04 fit
    expect(() => approveJobs(pid, ids)).toThrow(/project budget/);
    expect(projectSpend(pid).committed).toBe(0);
    expect(listJobs({ projectId: pid, states: ['AWAITING_APPROVAL'] }).length).toBe(3);
    void createJob;
  });
});
