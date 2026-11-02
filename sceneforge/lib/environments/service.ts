import { asc, eq, like, or, and } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '../db';
import { newId } from '../ids';
import { getAsset } from '../assets/service';
import { LockedError } from '../characters/service';

export type Environment = typeof schema.environments.$inferSelect;

export const ENV_CATEGORIES = ['classroom', 'city', 'bedroom', 'forest', 'night-sky', 'historical', 'fantasy', 'scifi', 'rooftop', 'general'] as const;
export const LAYER_ROLES = ['background', 'midground', 'foreground', 'overlay'] as const;

export const EnvironmentInput = z.object({
  name: z.string().min(1).max(100),
  category: z.string().max(40).default('general'),
  description: z.string().max(2000).default(''),
  timeOfDay: z.enum(['day', 'sunset', 'night', 'dawn', 'interior']).default('day'),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).default('#1b1f2a'),
  lighting: z.object({ tint: z.string().nullable().default(null), tintOpacity: z.number().min(0).max(1).default(0), ambience: z.string().optional() }).default({ tint: null, tintOpacity: 0 }),
  cameraPresets: z.array(z.string()).default(['wide', 'medium', 'closeup']),
});

export function listEnvironments(q?: string) {
  const db = getDb();
  const envs = db
    .select()
    .from(schema.environments)
    .where(q ? or(like(schema.environments.name, `%${q}%`), like(schema.environments.category, `%${q}%`)) : undefined)
    .orderBy(asc(schema.environments.name))
    .all();
  const layers = db.select().from(schema.environmentLayers).orderBy(asc(schema.environmentLayers.order)).all();
  return envs.map((e) => ({ ...e, layers: layers.filter((l) => l.environmentId === e.id) }));
}

export function getEnvironment(id: string) {
  const db = getDb();
  const e = db.select().from(schema.environments).where(eq(schema.environments.id, id)).get();
  if (!e) return null;
  const layers = db.select().from(schema.environmentLayers).where(eq(schema.environmentLayers.environmentId, id)).orderBy(asc(schema.environmentLayers.order)).all();
  const variants = db.select().from(schema.environments).where(eq(schema.environments.variantOf, e.variantOf ?? e.id)).all();
  return { ...e, layers, variants };
}

function requireEnv(id: string) {
  const e = getDb().select().from(schema.environments).where(eq(schema.environments.id, id)).get();
  if (!e) throw new Error('Environment not found');
  return e;
}

export function createEnvironment(raw: z.input<typeof EnvironmentInput>) {
  const input = EnvironmentInput.parse(raw);
  const id = newId('env');
  getDb()
    .insert(schema.environments)
    .values({ id, ...input })
    .run();
  return id;
}

export function updateEnvironment(id: string, raw: Partial<z.input<typeof EnvironmentInput>>) {
  const e = requireEnv(id);
  if (e.locked) throw new LockedError(`${e.name} is locked`);
  const parsed = EnvironmentInput.partial().parse(raw) as Record<string, unknown>;
  const patch = Object.fromEntries(Object.keys(raw).filter((k) => k in parsed).map((k) => [k, parsed[k]]));
  if (Object.keys(patch).length) getDb().update(schema.environments).set(patch).where(eq(schema.environments.id, id)).run();
}

export function addLayer(environmentId: string, l: { assetId: string; role: (typeof LAYER_ROLES)[number]; parallax?: number; needsReview?: boolean }) {
  const e = requireEnv(environmentId);
  if (e.locked) throw new LockedError(`${e.name} is locked`);
  const a = getAsset(l.assetId);
  if (!a || a.kind !== 'image') throw new Error('Layer must be an image asset');
  const existing = getDb().select().from(schema.environmentLayers).where(eq(schema.environmentLayers.environmentId, environmentId)).all();
  const defaults = { background: 0.15, midground: 0.5, foreground: 1.25, overlay: 1 } as const;
  const id = newId('lay');
  getDb()
    .insert(schema.environmentLayers)
    .values({ id, environmentId, assetId: l.assetId, role: l.role, order: existing.length, parallax: l.parallax ?? defaults[l.role], needsReview: l.needsReview ?? false })
    .run();
  return id;
}

export function updateLayer(layerId: string, patch: { parallax?: number; order?: number; role?: string; needsReview?: boolean }) {
  const l = getDb().select().from(schema.environmentLayers).where(eq(schema.environmentLayers.id, layerId)).get();
  if (!l) throw new Error('Layer not found');
  if (requireEnv(l.environmentId).locked) throw new LockedError('Environment is locked');
  getDb().update(schema.environmentLayers).set(patch).where(eq(schema.environmentLayers.id, layerId)).run();
}

export function removeLayer(layerId: string) {
  const l = getDb().select().from(schema.environmentLayers).where(eq(schema.environmentLayers.id, layerId)).get();
  if (!l) return;
  if (requireEnv(l.environmentId).locked) throw new LockedError('Environment is locked');
  getDb().delete(schema.environmentLayers).where(eq(schema.environmentLayers.id, layerId)).run();
}

/** Day/night (or any lighting) variant sharing the same layer artwork with different lighting. */
export function createLightingVariant(environmentId: string, v: { name: string; timeOfDay: 'day' | 'sunset' | 'night' | 'dawn' | 'interior'; tint: string; tintOpacity: number }) {
  const e = requireEnv(environmentId);
  const id = createEnvironment({
    name: v.name,
    category: e.category,
    description: e.description,
    timeOfDay: v.timeOfDay,
    backgroundColor: e.backgroundColor,
    lighting: { tint: v.tint, tintOpacity: v.tintOpacity },
    cameraPresets: e.cameraPresets,
  });
  getDb().update(schema.environments).set({ variantOf: e.variantOf ?? e.id }).where(eq(schema.environments.id, id)).run();
  const layers = getDb().select().from(schema.environmentLayers).where(eq(schema.environmentLayers.environmentId, environmentId)).all();
  for (const l of layers) getDb().insert(schema.environmentLayers).values({ ...l, id: newId('lay'), environmentId: id }).run();
  return id;
}

export function setEnvironmentLocked(id: string, locked: boolean) {
  const e = requireEnv(id);
  if (locked) {
    const layers = getDb().select().from(schema.environmentLayers).where(eq(schema.environmentLayers.environmentId, id)).all();
    if (!layers.length) throw new Error('Add at least one layer before locking');
    if (layers.some((l) => l.needsReview)) throw new Error('Some layers came from automatic segmentation and still need review');
  }
  getDb().update(schema.environments).set({ locked }).where(eq(schema.environments.id, e.id)).run();
}

export function assignSceneEnvironment(sceneId: string, environmentId: string | null) {
  getDb().update(schema.scenes).set({ environmentId }).where(eq(schema.scenes.id, sceneId)).run();
}

export function environmentLayersFor(environmentId: string | null) {
  if (!environmentId) return [];
  return getDb()
    .select({ l: schema.environmentLayers, a: schema.assets })
    .from(schema.environmentLayers)
    .innerJoin(schema.assets, eq(schema.assets.id, schema.environmentLayers.assetId))
    .where(and(eq(schema.environmentLayers.environmentId, environmentId)))
    .orderBy(asc(schema.environmentLayers.order))
    .all();
}
