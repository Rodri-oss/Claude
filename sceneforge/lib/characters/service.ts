import { and, asc, eq, inArray, like, or } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '../db';
import { newId, nowIso } from '../ids';
import { SpriteRig } from '../types';
import { getAsset } from '../assets/service';

export type Character = typeof schema.characters.$inferSelect;
export type CharacterVariant = typeof schema.characterVariants.$inferSelect;

export const VARIANT_KINDS = ['view', 'fullbody', 'sheet', 'reference', 'expression', 'outfit', 'pose', 'mouth', 'eyes'] as const;
export const CONTINUITY_ITEMS = ['Hair and face', 'Clothing', 'Colors', 'Body proportions', 'Accessories', 'Scene lighting and style'] as const;
/** Fields frozen when a character design is locked. Voice and personality can still evolve. */
const DESIGN_FIELDS = ['palette', 'proportions', 'identifyingDetails', 'description'] as const;

export class LockedError extends Error {}

export function listCharacters(filter: { q?: string; seriesId?: string } = {}) {
  const conds = [];
  if (filter.q) conds.push(or(like(schema.characters.name, `%${filter.q}%`), like(schema.characters.description, `%${filter.q}%`)));
  if (filter.seriesId) conds.push(eq(schema.characters.seriesId, filter.seriesId));
  const chars = getDb()
    .select()
    .from(schema.characters)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(schema.characters.name))
    .all();
  return chars.map((c) => ({ ...c, thumbAssetId: thumbFor(c) }));
}

function thumbFor(c: Character): string | null {
  if (c.rig?.poses) return Object.values(c.rig.poses)[0] ?? null;
  const v = getDb().select().from(schema.characterVariants).where(eq(schema.characterVariants.characterId, c.id)).get();
  return v?.assetId ?? null;
}

export function getCharacter(id: string) {
  const db = getDb();
  const c = db.select().from(schema.characters).where(eq(schema.characters.id, id)).get();
  if (!c) return null;
  const variants = db.select().from(schema.characterVariants).where(eq(schema.characterVariants.characterId, id)).orderBy(asc(schema.characterVariants.createdAt)).all();
  const projects = db
    .select({ id: schema.projects.id, title: schema.projects.title })
    .from(schema.projectCharacters)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.projectCharacters.projectId))
    .where(eq(schema.projectCharacters.characterId, id))
    .all();
  return { ...c, variants, projects, thumbAssetId: thumbFor(c) };
}

export function requireCharacter(id: string): Character {
  const c = getDb().select().from(schema.characters).where(eq(schema.characters.id, id)).get();
  if (!c) throw new Error(`Character ${id} not found`);
  return c;
}

export const CharacterInput = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(4000).default(''),
  personality: z.string().max(2000).default(''),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{3,8}$/)).max(12).default([]),
  proportions: z.string().max(500).default(''),
  identifyingDetails: z.string().max(1000).default(''),
  seriesId: z.string().nullable().default(null),
  voiceProvider: z.string().max(40).default('auto'),
  voiceId: z.string().max(100).default(''),
  voiceSettings: z.object({ speed: z.number().min(0.5).max(2).optional(), pitch: z.number().min(0.5).max(2).optional(), style: z.string().max(100).optional() }).default({}),
});

export function createCharacter(raw: z.input<typeof CharacterInput>) {
  const input = CharacterInput.parse(raw);
  const id = newId('chr');
  getDb()
    .insert(schema.characters)
    .values({ id, ...input, continuity: {} })
    .run();
  return requireCharacter(id);
}

export function updateCharacter(id: string, raw: Partial<z.input<typeof CharacterInput>>) {
  const c = requireCharacter(id);
  const parsed = CharacterInput.partial().parse(raw) as Record<string, unknown>;
  // zod applies defaults even in .partial(); only keep keys the caller actually supplied
  const input = Object.fromEntries(Object.keys(raw).filter((k) => k in parsed).map((k) => [k, parsed[k]])) as Partial<z.infer<typeof CharacterInput>>;
  if (c.locked) {
    for (const f of DESIGN_FIELDS)
      if (f in input && JSON.stringify((input as Record<string, unknown>)[f]) !== JSON.stringify((c as Record<string, unknown>)[f]))
        throw new LockedError(`${c.name}'s design is locked. Unlock it to change ${f}.`);
  }
  getDb().update(schema.characters).set({ ...input, updatedAt: nowIso() }).where(eq(schema.characters.id, id)).run();
  return requireCharacter(id);
}

export function deleteCharacter(id: string) {
  const c = requireCharacter(id);
  if (c.locked) throw new LockedError('Unlock the character before deleting it');
  const used = getDb().select().from(schema.projectCharacters).where(eq(schema.projectCharacters.characterId, id)).all();
  if (used.length) throw new Error(`Character is used by ${used.length} project(s); remove it from them first`);
  getDb().delete(schema.characters).where(eq(schema.characters.id, id)).run();
}

export function addVariant(characterId: string, v: { kind: (typeof VARIANT_KINDS)[number]; name: string; assetId: string; meta?: Record<string, unknown>; approved?: boolean }) {
  const c = requireCharacter(characterId);
  if (c.locked) throw new LockedError(`${c.name} is locked; unlock to add design variants`);
  const asset = getAsset(v.assetId);
  if (!asset || asset.kind !== 'image') throw new Error('Variant must reference an image asset');
  const id = newId('var');
  getDb()
    .insert(schema.characterVariants)
    .values({ id, characterId, kind: v.kind, name: v.name.slice(0, 60), assetId: v.assetId, approved: v.approved ?? false, meta: v.meta ?? {} })
    .run();
  return id;
}

export function setVariantApproval(variantId: string, approved: boolean) {
  const v = getDb().select().from(schema.characterVariants).where(eq(schema.characterVariants.id, variantId)).get();
  if (!v) throw new Error('Variant not found');
  const c = requireCharacter(v.characterId);
  if (c.locked) throw new LockedError(`${c.name} is locked`);
  getDb().update(schema.characterVariants).set({ approved }).where(eq(schema.characterVariants.id, variantId)).run();
}

export function removeVariant(variantId: string) {
  const v = getDb().select().from(schema.characterVariants).where(eq(schema.characterVariants.id, variantId)).get();
  if (!v) return;
  const c = requireCharacter(v.characterId);
  if (c.locked) throw new LockedError(`${c.name} is locked`);
  // The asset itself is preserved in the library; only the association is removed.
  getDb().delete(schema.characterVariants).where(eq(schema.characterVariants.id, variantId)).run();
}

/**
 * Build the sprite rig from approved variants:
 *   pose:<name> → poses, expression:<name> → faces, eyes:closed → eyesClosed, mouth:closed/open/wide → mouths.
 * Falls back to an approved full-body/reference image as a single static pose.
 */
export function buildRig(characterId: string): SpriteRig | null {
  const vs = getDb()
    .select()
    .from(schema.characterVariants)
    .where(and(eq(schema.characterVariants.characterId, characterId), eq(schema.characterVariants.approved, true)))
    .all();
  const poses: Record<string, string> = {};
  const faces: Record<string, string> = {};
  const mouths: Record<string, string> = {};
  let eyesClosed: string | null = null;
  for (const v of vs) {
    if (v.kind === 'pose') poses[v.name] = v.assetId;
    if (v.kind === 'expression') faces[v.name] = v.assetId;
    if (v.kind === 'eyes' && v.name === 'closed') eyesClosed = v.assetId;
    if (v.kind === 'mouth') mouths[v.name] = v.assetId;
  }
  if (!Object.keys(poses).length) {
    const full = vs.find((v) => v.kind === 'fullbody') ?? vs.find((v) => v.kind === 'view' && /front/i.test(v.name)) ?? vs.find((v) => v.kind === 'reference');
    if (full) poses.idle = full.assetId;
  }
  if (!Object.keys(poses).length) return null;
  const first = getAsset(Object.values(poses)[0])!;
  return SpriteRig.parse({
    width: first.width ?? 1,
    height: first.height ?? 1,
    poses,
    faces,
    eyesClosed,
    mouths: mouths.closed && mouths.open && mouths.wide ? { closed: mouths.closed, open: mouths.open, wide: mouths.wide } : null,
  });
}

export function rebuildRig(characterId: string) {
  const c = requireCharacter(characterId);
  if (c.locked) throw new LockedError(`${c.name} is locked`);
  const rig = buildRig(characterId);
  if (rig) {
    // Layered rigs must stack exactly: all layers share the base size.
    const ids = [...Object.values(rig.poses), ...Object.values(rig.faces), ...(rig.eyesClosed ? [rig.eyesClosed] : []), ...(rig.mouths ? Object.values(rig.mouths) : [])];
    const bad = ids.map((id) => getAsset(id)!).filter((a) => a.width !== rig.width || a.height !== rig.height);
    if (bad.length && (Object.keys(rig.faces).length || rig.mouths))
      throw new Error(`Layered sprites must all be ${rig.width}×${rig.height}px; mismatched: ${bad.map((a) => `${a.name} (${a.width}×${a.height})`).join(', ')}`);
  }
  getDb().update(schema.characters).set({ rig, updatedAt: nowIso() }).where(eq(schema.characters.id, characterId)).run();
  return rig;
}

export function setLocked(characterId: string, locked: boolean) {
  const c = requireCharacter(characterId);
  if (locked) {
    if (!c.rig) throw new Error(`${c.name} needs approved sprite/reference art (build the rig) before locking`);
    const unchecked = CONTINUITY_ITEMS.filter((i) => !c.continuity[i]);
    if (unchecked.length) throw new Error(`Complete the continuity checklist before locking: ${unchecked.join(', ')}`);
  }
  getDb().update(schema.characters).set({ locked, updatedAt: nowIso() }).where(eq(schema.characters.id, characterId)).run();
}

export function setContinuity(characterId: string, item: string, checked: boolean) {
  const c = requireCharacter(characterId);
  if (c.locked) throw new LockedError(`${c.name} is locked`);
  getDb()
    .update(schema.characters)
    .set({ continuity: { ...c.continuity, [item]: checked } })
    .where(eq(schema.characters.id, characterId))
    .run();
}

/** Approved reference images used to condition image generation for future shots. */
export function approvedReferences(characterId: string) {
  return getDb()
    .select()
    .from(schema.characterVariants)
    .where(and(eq(schema.characterVariants.characterId, characterId), eq(schema.characterVariants.approved, true), inArray(schema.characterVariants.kind, ['view', 'fullbody', 'sheet', 'reference', 'outfit'])))
    .all();
}

export function addToProject(projectId: string, characterId: string, role = 'supporting') {
  requireCharacter(characterId);
  getDb().insert(schema.projectCharacters).values({ projectId, characterId, role }).onConflictDoNothing().run();
}

export function removeFromProject(projectId: string, characterId: string) {
  const usedInLines = getDb()
    .select()
    .from(schema.dialogueLines)
    .where(and(eq(schema.dialogueLines.projectId, projectId), eq(schema.dialogueLines.characterId, characterId)))
    .all().length;
  if (usedInLines) throw new Error(`Character speaks ${usedInLines} line(s) in this project; reassign them first`);
  getDb()
    .delete(schema.projectCharacters)
    .where(and(eq(schema.projectCharacters.projectId, projectId), eq(schema.projectCharacters.characterId, characterId)))
    .run();
}
