import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '../db';
import { currentMonth, newId, nowIso } from '../ids';
import { allowPaidProviders } from '../config';
import type { BudgetCategory } from '../types';

export type BudgetSettings = typeof schema.budgetSettings.$inferSelect;

export const DEFAULT_ALLOCATIONS: Record<BudgetCategory, number> = { video: 0.55, image: 0.15, audio: 0.1, revision: 0.15, llm: 0.05 };

export function getBudgetSettings(): BudgetSettings {
  const db = getDb();
  let s = db.select().from(schema.budgetSettings).where(eq(schema.budgetSettings.id, 1)).get();
  if (!s) {
    db.insert(schema.budgetSettings).values({ id: 1, allocations: DEFAULT_ALLOCATIONS }).onConflictDoNothing().run();
    s = db.select().from(schema.budgetSettings).where(eq(schema.budgetSettings.id, 1)).get()!;
  }
  return s;
}

export const BudgetSettingsInput = z.object({
  monthlyLimitUsd: z.number().min(150).max(400).optional(),
  allocations: z.record(z.string(), z.number().min(0).max(1)).optional(),
  warnThreshold: z.number().min(0.1).max(1).optional(),
  defaultProjectLimitUsd: z.number().min(0).max(400).optional(),
  perSceneLimitUsd: z.number().min(0).max(400).optional(),
  perShotLimitUsd: z.number().min(0).max(400).optional(),
  maxGenerationsPerShot: z.number().int().min(1).max(50).optional(),
  maxBatchUsd: z.number().min(0).max(400).optional(),
  reserveUsd: z.number().min(0).max(200).optional(),
  killSwitch: z.boolean().optional(),
  countSimulated: z.boolean().optional(),
});

export function updateBudgetSettings(raw: z.input<typeof BudgetSettingsInput>) {
  const input = BudgetSettingsInput.parse(raw);
  if (input.allocations) {
    const sum = Object.values(input.allocations).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.011) throw new Error(`Allocations must sum to 100% (got ${(sum * 100).toFixed(1)}%)`);
  }
  getBudgetSettings();
  getDb().update(schema.budgetSettings).set({ ...input, updatedAt: nowIso() }).where(eq(schema.budgetSettings.id, 1)).run();
  return getBudgetSettings();
}

export class BudgetError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export interface SpendRequest {
  jobId: string;
  projectId: string | null;
  sceneId?: string | null;
  shotId?: string | null;
  category: BudgetCategory;
  amountUsd: number;
  provider: string;
  model: string;
  simulated: boolean;
  isRevision?: boolean;
}

type Scope = { projectId?: string | null; sceneId?: string | null; shotId?: string | null; month?: string; includeSimulated: boolean };

/** Committed = charges + adjustments + outstanding reservations (reservations − releases). */
function usedUsd(scope: Scope): number {
  const db = getDb();
  const conds = [eq(schema.budgetLedger.month, scope.month ?? currentMonth())];
  if (scope.projectId) conds.push(eq(schema.budgetLedger.projectId, scope.projectId));
  if (scope.sceneId) conds.push(eq(schema.budgetLedger.sceneId, scope.sceneId));
  if (scope.shotId) conds.push(eq(schema.budgetLedger.shotId, scope.shotId));
  if (!scope.includeSimulated) conds.push(eq(schema.budgetLedger.simulated, false));
  const r = db
    .select({
      v: sql<number>`coalesce(sum(case when ${schema.budgetLedger.type} = 'release' then -${schema.budgetLedger.amountUsd} else ${schema.budgetLedger.amountUsd} end), 0)`,
    })
    .from(schema.budgetLedger)
    .where(and(...conds))
    .get();
  return Math.round((r?.v ?? 0) * 10000) / 10000;
}

/** Shot-level & project-level spend are tracked across months (a project can span months). */
function usedAllTime(scope: Omit<Scope, 'month'>): number {
  const db = getDb();
  const conds = [];
  if (scope.projectId) conds.push(eq(schema.budgetLedger.projectId, scope.projectId));
  if (scope.sceneId) conds.push(eq(schema.budgetLedger.sceneId, scope.sceneId));
  if (scope.shotId) conds.push(eq(schema.budgetLedger.shotId, scope.shotId));
  if (!scope.includeSimulated) conds.push(eq(schema.budgetLedger.simulated, false));
  const r = db
    .select({
      v: sql<number>`coalesce(sum(case when ${schema.budgetLedger.type} = 'release' then -${schema.budgetLedger.amountUsd} else ${schema.budgetLedger.amountUsd} end), 0)`,
    })
    .from(schema.budgetLedger)
    .where(conds.length ? and(...conds) : undefined)
    .get();
  return Math.round((r?.v ?? 0) * 10000) / 10000;
}

/** Throws BudgetError if the spend would violate any policy. Pure check, no writes. */
export function checkSpend(req: Omit<SpendRequest, 'jobId'>) {
  const s = getBudgetSettings();
  if (req.amountUsd < 0) throw new BudgetError('invalid', 'Negative amount');
  if (!req.simulated) {
    if (s.killSwitch) throw new BudgetError('kill_switch', 'Paid-job kill switch is ON. Turn it off in Budget settings to submit paid jobs.');
    if (!allowPaidProviders()) throw new BudgetError('paid_disabled', 'Paid providers are disabled (SCENEFORGE_ALLOW_PAID_PROVIDERS is not "true").');
  }
  if (req.simulated && !s.countSimulated) return;
  if (req.amountUsd === 0) return;
  const inc = s.countSimulated;
  const month = usedUsd({ includeSimulated: inc });
  const limit = s.monthlyLimitUsd - (req.isRevision ? 0 : s.reserveUsd);
  if (month + req.amountUsd > limit + 1e-9)
    throw new BudgetError(
      'monthly_cap',
      `Would exceed monthly cap: $${month.toFixed(2)} committed + $${req.amountUsd.toFixed(2)} > $${limit.toFixed(2)}${req.isRevision ? '' : ` (limit $${s.monthlyLimitUsd} minus $${s.reserveUsd} revision reserve)`}`,
    );
  if (req.projectId) {
    const p = getDb().select().from(schema.projects).where(eq(schema.projects.id, req.projectId)).get();
    const used = usedAllTime({ projectId: req.projectId, includeSimulated: inc });
    if (p && used + req.amountUsd > p.budgetLimitUsd + 1e-9)
      throw new BudgetError('project_cap', `Would exceed project budget: $${used.toFixed(2)} + $${req.amountUsd.toFixed(2)} > $${p.budgetLimitUsd.toFixed(2)}`);
  }
  if (req.sceneId) {
    const used = usedAllTime({ sceneId: req.sceneId, includeSimulated: inc });
    if (used + req.amountUsd > s.perSceneLimitUsd + 1e-9)
      throw new BudgetError('scene_cap', `Would exceed per-scene limit: $${used.toFixed(2)} + $${req.amountUsd.toFixed(2)} > $${s.perSceneLimitUsd.toFixed(2)}`);
  }
  if (req.shotId) {
    const used = usedAllTime({ shotId: req.shotId, includeSimulated: inc });
    if (used + req.amountUsd > s.perShotLimitUsd + 1e-9)
      throw new BudgetError('shot_cap', `Would exceed per-shot limit: $${used.toFixed(2)} + $${req.amountUsd.toFixed(2)} > $${s.perShotLimitUsd.toFixed(2)}`);
    const gens = getDb()
      .select({ n: sql<number>`count(distinct ${schema.budgetLedger.jobId})` })
      .from(schema.budgetLedger)
      .where(and(eq(schema.budgetLedger.shotId, req.shotId), eq(schema.budgetLedger.type, 'reservation'), inc ? undefined : eq(schema.budgetLedger.simulated, false)))
      .get();
    if ((gens?.n ?? 0) >= s.maxGenerationsPerShot)
      throw new BudgetError('shot_generation_limit', `Shot already has ${gens?.n} paid generations (limit ${s.maxGenerationsPerShot}).`);
  }
}

export function checkBatch(totalUsd: number) {
  const s = getBudgetSettings();
  if (totalUsd > s.maxBatchUsd + 1e-9) throw new BudgetError('batch_cap', `Batch total $${totalUsd.toFixed(2)} exceeds max approved batch amount $${s.maxBatchUsd.toFixed(2)}`);
}

/** Atomically check and reserve. Returns the reservation ledger id. Idempotent per job. */
export function reserve(req: SpendRequest): string {
  const db = getDb();
  return db.transaction(
    (tx) => {
      const existing = tx
        .select()
        .from(schema.budgetLedger)
        .where(and(eq(schema.budgetLedger.jobId, req.jobId), eq(schema.budgetLedger.type, 'reservation')))
        .get();
      if (existing) return existing.id;
      checkSpend(req);
      const id = newId('led');
      tx.insert(schema.budgetLedger)
        .values({
          id,
          month: currentMonth(),
          projectId: req.projectId,
          sceneId: req.sceneId ?? null,
          shotId: req.shotId ?? null,
          jobId: req.jobId,
          category: req.isRevision ? 'revision' : req.category,
          type: 'reservation',
          amountUsd: req.amountUsd,
          provider: req.provider,
          model: req.model,
          simulated: req.simulated,
          note: 'Estimated cost reserved before submission',
        })
        .run();
      return id;
    },
    { behavior: 'immediate' },
  );
}

function outstanding(jobId: string): { reserved: number; released: number; charged: number; row: typeof schema.budgetLedger.$inferSelect | undefined } {
  const rows = getDb().select().from(schema.budgetLedger).where(eq(schema.budgetLedger.jobId, jobId)).all();
  const row = rows.find((r) => r.type === 'reservation');
  return {
    row,
    reserved: rows.filter((r) => r.type === 'reservation').reduce((a, r) => a + r.amountUsd, 0),
    released: rows.filter((r) => r.type === 'release').reduce((a, r) => a + r.amountUsd, 0),
    charged: rows.filter((r) => r.type === 'charge').reduce((a, r) => a + r.amountUsd, 0),
  };
}

/** Reconcile: release the reservation and record the provider-reported (or estimated) actual charge. */
export function settle(jobId: string, actualUsd: number, note = 'Provider-reported cost') {
  const db = getDb();
  db.transaction(
    (tx) => {
      const o = outstanding(jobId);
      if (!o.row) return;
      if (o.charged > 0) return; // already settled
      const base = { month: o.row.month, projectId: o.row.projectId, sceneId: o.row.sceneId, shotId: o.row.shotId, jobId, category: o.row.category, provider: o.row.provider, model: o.row.model, simulated: o.row.simulated };
      const toRelease = o.reserved - o.released;
      if (toRelease > 0) tx.insert(schema.budgetLedger).values({ ...base, id: newId('led'), type: 'release', amountUsd: toRelease, note: 'Reservation released on reconciliation' }).run();
      tx.insert(schema.budgetLedger).values({ ...base, id: newId('led'), type: 'charge', amountUsd: actualUsd, note }).run();
    },
    { behavior: 'immediate' },
  );
}

/** Release a reservation without charge — only when we KNOW the provider did not bill. */
export function release(jobId: string, note = 'Released: job not billed') {
  const db = getDb();
  db.transaction(
    (tx) => {
      const o = outstanding(jobId);
      if (!o.row) return;
      const toRelease = o.reserved - o.released;
      if (toRelease <= 0) return;
      tx.insert(schema.budgetLedger)
        .values({ month: o.row.month, projectId: o.row.projectId, sceneId: o.row.sceneId, shotId: o.row.shotId, jobId, category: o.row.category, provider: o.row.provider, model: o.row.model, simulated: o.row.simulated, id: newId('led'), type: 'release', amountUsd: toRelease, note })
        .run();
    },
    { behavior: 'immediate' },
  );
}

export function budgetSummary(month = currentMonth()) {
  const s = getBudgetSettings();
  const db = getDb();
  const rows = db.select().from(schema.budgetLedger).where(eq(schema.budgetLedger.month, month)).all();
  const sum = (f: (r: (typeof rows)[number]) => boolean) =>
    Math.round(rows.filter(f).reduce((a, r) => a + (r.type === 'release' ? -r.amountUsd : r.amountUsd), 0) * 10000) / 10000;
  const charged = (sim: boolean) => sum((r) => r.type === 'charge' && r.simulated === sim);
  const reserved = (sim: boolean) => sum((r) => (r.type === 'reservation' || r.type === 'release') && r.simulated === sim);
  const realCharged = charged(false);
  const realReserved = reserved(false);
  const simCharged = charged(true);
  const simReserved = reserved(true);
  const counted = realCharged + realReserved + (s.countSimulated ? simCharged + simReserved : 0);
  const byCategory: Record<string, { used: number; planned: number }> = {};
  for (const [cat, pct] of Object.entries(s.allocations)) byCategory[cat] = { used: 0, planned: Math.round(pct * s.monthlyLimitUsd * 100) / 100 };
  for (const r of rows) {
    if (!s.countSimulated && r.simulated) continue;
    byCategory[r.category] ??= { used: 0, planned: 0 };
    byCategory[r.category].used += r.type === 'release' ? -r.amountUsd : r.amountUsd;
  }
  const byProject: Record<string, number> = {};
  for (const r of rows) {
    if (!s.countSimulated && r.simulated) continue;
    const k = r.projectId ?? '(none)';
    byProject[k] = (byProject[k] ?? 0) + (r.type === 'release' ? -r.amountUsd : r.amountUsd);
  }
  const usage = counted / s.monthlyLimitUsd;
  return {
    month,
    settings: s,
    real: { charged: realCharged, reserved: realReserved },
    simulated: { charged: simCharged, reserved: simReserved },
    committed: Math.round(counted * 10000) / 10000,
    remaining: Math.round((s.monthlyLimitUsd - counted) * 10000) / 10000,
    usage,
    warning: usage >= s.warnThreshold,
    byCategory,
    byProject,
    paidProvidersEnabled: allowPaidProviders(),
  };
}

export function projectSpend(projectId: string) {
  const s = getBudgetSettings();
  return {
    committed: usedAllTime({ projectId, includeSimulated: s.countSimulated }),
    real: usedAllTime({ projectId, includeSimulated: false }),
  };
}

export function ledgerEntries(filter: { month?: string; projectId?: string; limit?: number } = {}) {
  const conds = [];
  if (filter.month) conds.push(eq(schema.budgetLedger.month, filter.month));
  if (filter.projectId) conds.push(eq(schema.budgetLedger.projectId, filter.projectId));
  return getDb()
    .select()
    .from(schema.budgetLedger)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sql`${schema.budgetLedger.createdAt} desc`)
    .limit(filter.limit ?? 300)
    .all();
}

/** Remove simulated (mock) ledger entries — real spend is never touched. */
export function resetSimulatedSpend() {
  getDb().delete(schema.budgetLedger).where(eq(schema.budgetLedger.simulated, true)).run();
}
