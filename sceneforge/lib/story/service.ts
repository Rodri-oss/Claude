import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '../db';
import { newId, nowIso } from '../ids';
import { ASPECTS, DEFAULT_MIX, DEFAULT_TRACK_SETTINGS, type Aspect, MixRatios } from '../types';
import { getPreset } from './presets';
import { estimateSceneSec, NARRATOR, type StoryDraft, StoryDraft as StoryDraftSchema, type SceneDraft } from './draft';
import { advanceStage, isApproved } from '../approvals/service';
import { getBudgetSettings } from '../budget/service';

export type Project = typeof schema.projects.$inferSelect;
export type Scene = typeof schema.scenes.$inferSelect;
export type DialogueLine = typeof schema.dialogueLines.$inferSelect;

export const CreateProjectInput = z.object({
  title: z.string().min(1).max(200),
  presetId: z.string().default('adventure'),
  aspect: z.enum(['16:9', '9:16']).default('16:9'),
  targetDurationSec: z.number().int().min(120).max(300).default(120),
  fps: z.number().int().min(12).max(60).default(24),
  budgetLimitUsd: z.number().min(0).max(400).optional(),
  seriesId: z.string().nullable().optional(),
  episodeNumber: z.number().int().positive().optional(),
  sourceKind: z.enum(['idea', 'outline', 'script']).default('idea'),
  sourceInput: z.string().max(200_000).default(''),
  audience: z.string().max(100).default('General'),
  templateProjectId: z.string().optional(),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export function createProject(raw: z.input<typeof CreateProjectInput>): Project {
  const input = CreateProjectInput.parse(raw);
  const db = getDb();
  const preset = getPreset(input.presetId);
  const dims = ASPECTS[input.aspect as Aspect];
  const id = newId('prj');
  db.transaction((tx) => {
    tx.insert(schema.projects)
      .values({
        id,
        title: input.title,
        genre: preset.genre,
        preset: preset.id,
        audience: input.audience,
        sourceKind: input.sourceKind,
        sourceInput: input.sourceInput,
        productionStyle: preset.productionStyle,
        targetDurationSec: input.targetDurationSec,
        aspect: input.aspect,
        width: dims.width,
        height: dims.height,
        fps: input.fps,
        mix: preset.mix ?? DEFAULT_MIX,
        budgetLimitUsd: input.budgetLimitUsd ?? getBudgetSettings().defaultProjectLimitUsd,
      })
      .run();
    // Each project gets its own Style Bible seeded from the preset; later preset changes never overwrite it.
    tx.insert(schema.styleBibles).values({ id: newId('sty'), projectId: id, ...preset.style, notes: '' }).run();
    tx.insert(schema.editorSettings)
      .values({ projectId: id, tracks: structuredClone(DEFAULT_TRACK_SETTINGS) })
      .run();
    if (input.seriesId) {
      const n =
        input.episodeNumber ??
        (tx.select({ m: sql<number>`coalesce(max(${schema.episodes.number}),0)` }).from(schema.episodes).where(eq(schema.episodes.seriesId, input.seriesId)).get()?.m ?? 0) + 1;
      tx.insert(schema.episodes).values({ id: newId('epi'), seriesId: input.seriesId, projectId: id, number: n }).run();
    }
  });
  if (input.templateProjectId) copyTemplateCast(input.templateProjectId, id);
  return getProject(id)!;
}

function copyTemplateCast(fromProjectId: string, toProjectId: string) {
  const db = getDb();
  const cast = db.select().from(schema.projectCharacters).where(eq(schema.projectCharacters.projectId, fromProjectId)).all();
  for (const c of cast) db.insert(schema.projectCharacters).values({ ...c, projectId: toProjectId }).onConflictDoNothing().run();
}

export function getProject(id: string): Project | undefined {
  return getDb().select().from(schema.projects).where(eq(schema.projects.id, id)).get();
}

export function requireProject(id: string): Project {
  const p = getProject(id);
  if (!p) throw new Error(`Project ${id} not found`);
  return p;
}

export function listProjects() {
  const db = getDb();
  const rows = db.select().from(schema.projects).orderBy(sql`${schema.projects.updatedAt} desc`).all();
  const eps = db.select({ e: schema.episodes, s: schema.series }).from(schema.episodes).innerJoin(schema.series, eq(schema.series.id, schema.episodes.seriesId)).all();
  return rows.map((p) => {
    const ep = eps.find((e) => e.e.projectId === p.id);
    return { ...p, series: ep ? { id: ep.s.id, name: ep.s.name, episode: ep.e.number } : null };
  });
}

export const UpdateProjectInput = z.object({
  title: z.string().min(1).max(200).optional(),
  logline: z.string().max(1000).optional(),
  synopsis: z.string().max(8000).optional(),
  audience: z.string().max(100).optional(),
  targetDurationSec: z.number().int().min(120).max(300).optional(),
  aspect: z.enum(['16:9', '9:16']).optional(),
  fps: z.number().int().min(12).max(60).optional(),
  mix: MixRatios.optional(),
  budgetLimitUsd: z.number().min(0).max(400).optional(),
  productionStyle: z.enum(['narration-first', 'dialogue-first']).optional(),
  isTemplate: z.boolean().optional(),
  sourceInput: z.string().max(200_000).optional(),
});

export function updateProject(id: string, raw: z.input<typeof UpdateProjectInput>) {
  const input = UpdateProjectInput.parse(raw);
  const patch: Partial<Project> = { ...input, updatedAt: nowIso() } as Partial<Project>;
  if (input.aspect) Object.assign(patch, ASPECTS[input.aspect]);
  if (input.mix) {
    const sum = input.mix.A + input.mix.B + input.mix.C;
    if (sum <= 0) throw new Error('Mix ratios must sum to more than 0');
    patch.mix = { A: input.mix.A / sum, B: input.mix.B / sum, C: input.mix.C / sum };
  }
  getDb().update(schema.projects).set(patch).where(eq(schema.projects.id, id)).run();
  return requireProject(id);
}

export function deleteProject(id: string) {
  getDb().delete(schema.projects).where(eq(schema.projects.id, id)).run();
}

// ---------------------------------------------------------------------------------------------
// Story
// ---------------------------------------------------------------------------------------------

export function getStory(projectId: string) {
  const db = getDb();
  const project = requireProject(projectId);
  const scenes = db.select().from(schema.scenes).where(eq(schema.scenes.projectId, projectId)).orderBy(asc(schema.scenes.seq)).all();
  const lines = db.select().from(schema.dialogueLines).where(eq(schema.dialogueLines.projectId, projectId)).orderBy(asc(schema.dialogueLines.seq)).all();
  const bible = db.select().from(schema.styleBibles).where(eq(schema.styleBibles.projectId, projectId)).get();
  return {
    project,
    styleBible: bible,
    scenes: scenes.map((s) => ({ ...s, lines: lines.filter((l) => l.sceneId === s.id) })),
    estimatedRuntimeSec: scenes.reduce((sum, s) => sum + s.estDurationSec, 0),
  };
}

/** Convert the stored story back into a draft (e.g. for the script editor). */
export function storyAsDraft(projectId: string): StoryDraft | null {
  const { project, scenes } = getStory(projectId);
  if (!scenes.length) return null;
  const cast = getCast(projectId);
  return StoryDraftSchema.parse({
    title: project.title,
    logline: project.logline,
    synopsis: project.synopsis,
    genre: project.genre,
    audience: project.audience,
    characters: cast.map((c) => ({ name: c.name, description: c.description, personality: c.personality, role: c.role })),
    locations: [...new Set(scenes.map((s) => s.locationName).filter(Boolean))].map((name) => ({ name, description: '' })),
    beats: scenes.map((s) => s.beatEnd || s.title),
    scenes: scenes.map((s) => ({
      title: s.title,
      description: s.description,
      location: s.locationName,
      tone: s.tone,
      beatStart: s.beatStart,
      beatEnd: s.beatEnd,
      actions: s.actions,
      lines: s.lines.map((l) => ({ speaker: l.speakerName, text: l.text, emotion: l.emotion })),
    })),
  });
}

export function getCast(projectId: string) {
  return getDb()
    .select({ c: schema.characters, role: schema.projectCharacters.role })
    .from(schema.projectCharacters)
    .innerJoin(schema.characters, eq(schema.characters.id, schema.projectCharacters.characterId))
    .where(eq(schema.projectCharacters.projectId, projectId))
    .all()
    .map((r) => ({ ...r.c, role: r.role }));
}

function findOrCreateCharacter(projectId: string, name: string, info: { description?: string; personality?: string; role?: string }) {
  const db = getDb();
  const cast = getCast(projectId);
  const existing = cast.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  // Reuse a library character with the same name (e.g. recurring series cast) rather than duplicating it.
  const lib = db.select().from(schema.characters).where(sql`lower(${schema.characters.name}) = ${name.toLowerCase()}`).get();
  const id = lib?.id ?? newId('chr');
  if (!lib) {
    db.insert(schema.characters)
      .values({ id, name, description: info.description ?? '', personality: info.personality ?? '', palette: [], voiceSettings: {}, continuity: {} })
      .run();
  }
  db.insert(schema.projectCharacters).values({ projectId, characterId: id, role: info.role ?? 'supporting' }).onConflictDoNothing().run();
  return id;
}

function matchEnvironment(name: string): string | null {
  if (!name) return null;
  const env = getDb().select().from(schema.environments).where(sql`lower(${schema.environments.name}) = ${name.toLowerCase()}`).get();
  return env?.id ?? null;
}

/**
 * Replace the project's scenes + dialogue with a draft. Shots belonging to replaced scenes are removed too
 * (their generated assets stay in the asset library). Changing the story makes any story approval stale.
 */
export function applyStoryDraft(projectId: string, raw: StoryDraft) {
  const draft = StoryDraftSchema.parse(raw);
  const db = getDb();
  requireProject(projectId);
  for (const c of draft.characters) findOrCreateCharacter(projectId, c.name, c);
  db.transaction((tx) => {
    tx.delete(schema.scenes).where(eq(schema.scenes.projectId, projectId)).run();
    tx.update(schema.projects)
      .set({ title: draft.title, logline: draft.logline, synopsis: draft.synopsis, audience: draft.audience, updatedAt: nowIso() })
      .where(eq(schema.projects.id, projectId))
      .run();
  });
  draft.scenes.forEach((s, i) => insertScene(projectId, s, i + 1));
  advanceStage(projectId);
  return getStory(projectId);
}

function insertScene(projectId: string, s: SceneDraft, seq: number) {
  const db = getDb();
  const id = newId('scn');
  const castIds = new Map<string, string>();
  for (const l of s.lines) if (l.speaker !== NARRATOR && !castIds.has(l.speaker)) castIds.set(l.speaker, findOrCreateCharacter(projectId, titleish(l.speaker), {}));
  const envId = matchEnvironment(s.location);
  db.insert(schema.scenes)
    .values({
      id,
      projectId,
      seq,
      title: s.title,
      description: s.description,
      environmentId: envId,
      locationName: s.location,
      beatStart: s.beatStart,
      beatEnd: s.beatEnd,
      tone: s.tone,
      estDurationSec: Math.round(estimateSceneSec(s) * 10) / 10,
      actions: s.actions,
      requiredAssets: [...(s.location ? [`environment:${s.location}`] : []), ...[...castIds.keys()].map((n) => `character:${n}`)],
    })
    .run();
  s.lines.forEach((l, j) =>
    db
      .insert(schema.dialogueLines)
      .values({
        id: newId('dlg'),
        projectId,
        sceneId: id,
        seq: j + 1,
        characterId: l.speaker === NARRATOR ? null : castIds.get(l.speaker) ?? null,
        speakerName: l.speaker === NARRATOR ? NARRATOR : titleish(l.speaker),
        text: l.text,
        emotion: l.emotion,
        pronunciation: {},
      })
      .run(),
  );
  return id;
}

const titleish = (s: string) => (s === s.toUpperCase() ? s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : s);

export function recomputeSceneEstimate(sceneId: string) {
  const db = getDb();
  const scene = db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId)).get();
  if (!scene) return;
  const lines = db.select().from(schema.dialogueLines).where(eq(schema.dialogueLines.sceneId, sceneId)).all();
  const est = estimateSceneSec({ actions: scene.actions, lines: lines.map((l) => ({ speaker: l.speakerName, text: l.text, emotion: l.emotion })) });
  db.update(schema.scenes).set({ estDurationSec: Math.round(est * 10) / 10 }).where(eq(schema.scenes.id, sceneId)).run();
}

export const SceneUpdate = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional(),
  locationName: z.string().max(200).optional(),
  environmentId: z.string().nullable().optional(),
  tone: z.string().max(80).optional(),
  beatStart: z.string().max(400).optional(),
  beatEnd: z.string().max(400).optional(),
  actions: z.array(z.string().max(1000)).optional(),
  music: z.string().max(200).optional(),
  ambience: z.string().max(200).optional(),
});

export function updateScene(sceneId: string, raw: z.input<typeof SceneUpdate>) {
  const patch = SceneUpdate.parse(raw);
  const db = getDb();
  db.update(schema.scenes).set(patch).where(eq(schema.scenes.id, sceneId)).run();
  recomputeSceneEstimate(sceneId);
  const s = db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId)).get()!;
  advanceStage(s.projectId);
  return s;
}

export function addScene(projectId: string, title: string) {
  const db = getDb();
  const max = db.select({ m: sql<number>`coalesce(max(${schema.scenes.seq}),0)` }).from(schema.scenes).where(eq(schema.scenes.projectId, projectId)).get()?.m ?? 0;
  const id = insertScene(projectId, { title, description: '', location: '', tone: '', beatStart: '', beatEnd: '', actions: [], lines: [] }, max + 1);
  advanceStage(projectId);
  return id;
}

export function deleteScene(sceneId: string) {
  const db = getDb();
  const s = db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId)).get();
  if (!s) return;
  db.delete(schema.scenes).where(eq(schema.scenes.id, sceneId)).run();
  renumber('scenes', s.projectId);
  advanceStage(s.projectId);
}

/** Reorder scenes by full ordered id list. */
export function reorderScenes(projectId: string, orderedIds: string[]) {
  const db = getDb();
  const existing = db.select({ id: schema.scenes.id }).from(schema.scenes).where(eq(schema.scenes.projectId, projectId)).all().map((r) => r.id);
  if (existing.length !== orderedIds.length || !existing.every((id) => orderedIds.includes(id))) throw new Error('Reorder list must contain every scene exactly once');
  db.transaction((tx) => orderedIds.forEach((id, i) => tx.update(schema.scenes).set({ seq: i + 1 }).where(eq(schema.scenes.id, id)).run()));
  advanceStage(projectId);
}

function renumber(kind: 'scenes', projectId: string) {
  const db = getDb();
  if (kind === 'scenes') {
    const rows = db.select({ id: schema.scenes.id }).from(schema.scenes).where(eq(schema.scenes.projectId, projectId)).orderBy(asc(schema.scenes.seq)).all();
    rows.forEach((r, i) => db.update(schema.scenes).set({ seq: i + 1 }).where(eq(schema.scenes.id, r.id)).run());
  }
}

export const LineUpsert = z.object({
  id: z.string().optional(),
  sceneId: z.string(),
  speakerName: z.string().min(1).max(60),
  text: z.string().min(1).max(2000),
  emotion: z.string().max(40).default('neutral'),
  speed: z.number().min(0.5).max(2).default(1),
  pronunciation: z.record(z.string(), z.string()).default({}),
});

export function upsertLine(raw: z.input<typeof LineUpsert>) {
  const input = LineUpsert.parse(raw);
  const db = getDb();
  const scene = db.select().from(schema.scenes).where(eq(schema.scenes.id, input.sceneId)).get();
  if (!scene) throw new Error('Scene not found');
  const speakerName = input.speakerName.toUpperCase() === NARRATOR ? NARRATOR : input.speakerName;
  const characterId = speakerName === NARRATOR ? null : findOrCreateCharacter(scene.projectId, speakerName, {});
  let id = input.id;
  if (id) {
    const prev = db.select().from(schema.dialogueLines).where(eq(schema.dialogueLines.id, id)).get();
    if (!prev) throw new Error('Line not found');
    // Changing text/voice detaches the old audio (kept in history) so only this line needs regenerating.
    const changed = prev.text !== input.text || prev.characterId !== characterId || prev.emotion !== input.emotion || prev.speed !== input.speed || JSON.stringify(prev.pronunciation) !== JSON.stringify(input.pronunciation);
    db.update(schema.dialogueLines)
      .set({ speakerName, characterId, text: input.text, emotion: input.emotion, speed: input.speed, pronunciation: input.pronunciation, ...(changed ? { activeAudioId: null } : {}) })
      .where(eq(schema.dialogueLines.id, id))
      .run();
  } else {
    id = newId('dlg');
    const max = db.select({ m: sql<number>`coalesce(max(${schema.dialogueLines.seq}),0)` }).from(schema.dialogueLines).where(eq(schema.dialogueLines.sceneId, input.sceneId)).get()?.m ?? 0;
    db.insert(schema.dialogueLines)
      .values({ id, projectId: scene.projectId, sceneId: input.sceneId, seq: max + 1, characterId, speakerName, text: input.text, emotion: input.emotion, speed: input.speed, pronunciation: input.pronunciation })
      .run();
  }
  recomputeSceneEstimate(input.sceneId);
  advanceStage(scene.projectId);
  return db.select().from(schema.dialogueLines).where(eq(schema.dialogueLines.id, id)).get()!;
}

export function deleteLine(id: string) {
  const db = getDb();
  const l = db.select().from(schema.dialogueLines).where(eq(schema.dialogueLines.id, id)).get();
  if (!l) return;
  db.delete(schema.dialogueLines).where(eq(schema.dialogueLines.id, id)).run();
  const rest = db.select({ id: schema.dialogueLines.id }).from(schema.dialogueLines).where(eq(schema.dialogueLines.sceneId, l.sceneId)).orderBy(asc(schema.dialogueLines.seq)).all();
  rest.forEach((r, i) => db.update(schema.dialogueLines).set({ seq: i + 1 }).where(eq(schema.dialogueLines.id, r.id)).run());
  // Remove the line from any shot that referenced it
  const shots = db.select().from(schema.shots).where(eq(schema.shots.sceneId, l.sceneId)).all();
  for (const s of shots)
    if (s.dialogueLineIds.includes(id)) db.update(schema.shots).set({ dialogueLineIds: s.dialogueLineIds.filter((x) => x !== id) }).where(eq(schema.shots.id, s.id)).run();
  recomputeSceneEstimate(l.sceneId);
  advanceStage(l.projectId);
}

export function moveLine(id: string, direction: -1 | 1) {
  const db = getDb();
  const l = db.select().from(schema.dialogueLines).where(eq(schema.dialogueLines.id, id)).get();
  if (!l) throw new Error('Line not found');
  const other = db
    .select()
    .from(schema.dialogueLines)
    .where(and(eq(schema.dialogueLines.sceneId, l.sceneId), eq(schema.dialogueLines.seq, l.seq + direction)))
    .get();
  if (!other) return;
  db.transaction((tx) => {
    tx.update(schema.dialogueLines).set({ seq: other.seq }).where(eq(schema.dialogueLines.id, l.id)).run();
    tx.update(schema.dialogueLines).set({ seq: l.seq }).where(eq(schema.dialogueLines.id, other.id)).run();
  });
  advanceStage(l.projectId);
}

export function updateStyleBible(projectId: string, patch: { artStyle?: string; palette?: string[]; lineWork?: string; lighting?: string; cameraLanguage?: string; notes?: string }) {
  const db = getDb();
  const bible = db.select().from(schema.styleBibles).where(eq(schema.styleBibles.projectId, projectId)).get();
  if (bible?.locked) throw new Error('Style Bible is locked by art approval. Revoke art approval to edit it.');
  db.update(schema.styleBibles).set({ ...patch, updatedAt: nowIso() }).where(eq(schema.styleBibles.projectId, projectId)).run();
}

export function storyApproved(projectId: string) {
  return isApproved(projectId, 'story');
}

export function linesById(ids: string[]) {
  if (!ids.length) return [];
  return getDb().select().from(schema.dialogueLines).where(inArray(schema.dialogueLines.id, ids)).all();
}
