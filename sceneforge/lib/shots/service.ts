import fs from 'node:fs';
import path from 'node:path';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema } from '../db';
import { newId, nowIso } from '../ids';
import {
  CAMERA_MOVES,
  FRAMINGS,
  GenerationSettings,
  SHOT_MODES,
  ShotCamera,
  ShotCharacter,
  ShotEffects,
  TRANSITIONS,
  type ShotMode,
} from '../types';
import { requireProject, getStory } from '../story/service';
import { estimateActionSec, estimateLineSec, LINE_GAP_SEC, NARRATOR } from '../story/draft';
import { getPreset } from '../story/presets';
import { advanceStage, requireApproved, isApproved } from '../approvals/service';
import { defaultSlots, expressionFor, framingPlacement, cameraKeys } from '../animation/staging';
import { renderKeyframe, type KeyframeSpec } from '../animation/keyframe';
import { assetAbsPath, getAsset, importAsset, listAssets } from '../assets/service';
import { tmpFile } from '../assets/storage';
import { approvedReferences } from '../characters/service';
import { environmentLayersFor } from '../environments/service';
import { createJob, type Job } from '../jobs/queue';
import { getModel } from '../providers/registry';

export type Shot = typeof schema.shots.$inferSelect;
export type ShotVersion = typeof schema.shotVersions.$inferSelect;

const ACTION_HEAVY = /\b(fight|fights|run|runs|sprint|chase|explod|crash|leap|jump|battle|strike|attack|fall|dash|race|flee|swing|throw)/i;
const FAST_MOVE = /\b(run|runs|sprint|dash|race|chase|flee)/i;

// ---------------------------------------------------------------------------------------------
// Planner: scenes → shots (requires story approval)
// ---------------------------------------------------------------------------------------------

interface PlannedShot {
  sceneId: string;
  purpose: string;
  durationSec: number;
  dialogueLineIds: string[];
  characters: ShotCharacter[];
  environmentId: string | null;
  camera: ShotCamera;
  effects: ShotEffects;
  transitionIn: string;
  mode: ShotMode;
  motionScore: number;
  isEstablishing: boolean;
  imagePrompt: string;
  motionPrompt: string;
  sfxTags: string[];
}

export function planShots(projectId: string, opts: { replace?: boolean } = {}) {
  requireApproved(projectId, 'story');
  const db = getDb();
  const project = requireProject(projectId);
  const existing = db.select({ id: schema.shots.id, approval: schema.shots.approval }).from(schema.shots).where(eq(schema.shots.projectId, projectId)).all();
  if (existing.length && !opts.replace) throw new Error('Shots already exist. Pass replace to re-plan (approved shot versions remain in the asset library).');
  if (existing.some((s) => s.approval === 'approved') && opts.replace)
    throw new Error('Some shots are approved. Re-planning would discard them — edit shots individually or reject them first.');
  const story = getStory(projectId);
  const preset = getPreset(project.preset);
  const bible = story.styleBible;
  const castRows = db
    .select({ c: schema.characters })
    .from(schema.projectCharacters)
    .innerJoin(schema.characters, eq(schema.characters.id, schema.projectCharacters.characterId))
    .where(eq(schema.projectCharacters.projectId, projectId))
    .all()
    .map((r) => r.c);
  const castById = new Map(castRows.map((c) => [c.id, c]));
  const envs = new Map(db.select().from(schema.environments).all().map((e) => [e.id, e]));
  const planned: PlannedShot[] = [];
  const styleText = bible ? `${bible.artStyle}; ${bible.lineWork}; palette ${bible.palette.join(' ')}` : '2D anime/cartoon';

  story.scenes.forEach((scene, si) => {
    const env = scene.environmentId ? envs.get(scene.environmentId) : undefined;
    const envName = env?.name ?? scene.locationName ?? 'location';
    const speakers = [...new Set(scene.lines.map((l) => l.characterId).filter(Boolean))] as string[];
    const present = speakers.slice(0, 3);
    const weather = (env?.lighting.ambience as never) ?? 'none';
    const baseFx = (): ShotEffects =>
      ShotEffects.parse({
        weather: ['rain', 'snow', 'dust', 'fireflies', 'sparkles', 'embers'].includes(weather) ? weather : 'none',
        tint: env?.lighting.tint ?? null,
        tintOpacity: env?.lighting.tintOpacity ?? 0,
      });
    const charsFor = (ids: string[], framing: (typeof FRAMINGS)[number], emotionById: Record<string, string> = {}): ShotCharacter[] => {
      const slots = defaultSlots(ids.length, framing);
      return ids.map((id, i) => {
        const c = castById.get(id);
        const faces = Object.keys(c?.rig?.faces ?? {});
        return ShotCharacter.parse({ characterId: id, pose: 'idle', expression: expressionFor(emotionById[id] ?? 'neutral', faces), x: slots[i], flip: slots[i] > 0.55 && ids.length > 1 });
      });
    };
    const describe = (ids: string[]) => ids.map((id) => castById.get(id)?.name).filter(Boolean).join(' and ');

    // 1. Establishing shot
    planned.push({
      sceneId: scene.id,
      purpose: `Establish ${envName}: ${scene.title}`,
      durationSec: 3.5,
      dialogueLineIds: [],
      characters: si === 0 ? [] : charsFor(present.slice(0, 2), 'establishing'),
      environmentId: scene.environmentId,
      camera: ShotCamera.parse({ framing: 'establishing', move: si % 2 ? 'pan-left' : 'pan-right' }),
      effects: baseFx(),
      transitionIn: si === 0 ? 'fade' : 'crossfade',
      mode: 'A',
      motionScore: 0.1,
      isEstablishing: true,
      imagePrompt: `${styleText}. Establishing wide shot of ${envName}. ${scene.description}`,
      motionPrompt: 'Slow cinematic pan across the environment, subtle ambient motion',
      sfxTags: [],
    });

    // 2. Dialogue + action shots, interleaved in story order (actions placed at the scene midpoint)
    const groups: { lines: typeof scene.lines; speaker: string | null }[] = [];
    for (const l of scene.lines) {
      const last = groups[groups.length - 1];
      const est = last ? last.lines.reduce((a, x) => a + estimateLineSec(x.text, x.emotion, x.speed), 0) : 0;
      if (last && last.speaker === l.characterId && est + estimateLineSec(l.text, l.emotion, l.speed) < 8) last.lines.push(l);
      else groups.push({ lines: [l], speaker: l.characterId });
    }
    const actionAt = Math.max(1, Math.floor(groups.length / 2));
    const actionShots = (scene.actions ?? []).map((a): PlannedShot => {
      const heavy = ACTION_HEAVY.test(a);
      const fast = FAST_MOVE.test(a);
      const lead = present[0];
      const chars = charsFor(lead ? [lead] : [], 'wide', lead ? { [lead]: heavy ? 'determined' : 'neutral' } : {});
      if (fast && chars[0]) {
        chars[0].x = 0.15;
        chars[0].moveToX = 0.85;
      } else if (chars[0]) chars[0].enterFrom = 'left';
      return {
        sceneId: scene.id,
        purpose: `Action: ${a}`,
        durationSec: Math.round((estimateActionSec(a) + 0.8) * 10) / 10,
        dialogueLineIds: [],
        characters: chars,
        environmentId: scene.environmentId,
        camera: ShotCamera.parse({ framing: 'wide', move: heavy ? 'shake' : 'pan-right', intensity: heavy ? 1.2 : 1 }),
        effects: { ...baseFx(), impacts: heavy && !fast ? [0.45] : [], speedLines: fast },
        transitionIn: 'cut',
        mode: 'A',
        motionScore: heavy ? 1 : 0.5,
        isEstablishing: false,
        imagePrompt: `${styleText}. ${describe(lead ? [lead] : [])} in ${envName}. ${a}`,
        motionPrompt: `${a}. Fluid 2D animation, consistent character design, no morphing.`,
        sfxTags: heavy ? (fast ? ['sfx:whoosh', 'sfx:steps'] : ['sfx:impact']) : [],
      };
    });

    groups.forEach((g, gi) => {
      if (gi === actionAt) planned.push(...actionShots.splice(0));
      const speech = g.lines.reduce((a, l) => a + estimateLineSec(l.text, l.emotion, l.speed), 0) + (g.lines.length - 1) * LINE_GAP_SEC;
      const narr = g.speaker === null;
      const emotion = g.lines[0].emotion;
      const emotional = /angry|shout|surprised|shocked|excited|sad|scared|determined/i.test(emotion);
      let framing: (typeof FRAMINGS)[number] = narr ? 'wide' : gi % 3 === 1 && g.speaker ? 'closeup' : 'medium';
      if (emotional && g.speaker) framing = 'closeup';
      const ids = narr ? present.slice(0, 2) : framing === 'closeup' ? [g.speaker!] : [...present.slice(0, 2), g.speaker!];
      const emotionById: Record<string, string> = g.speaker ? { [g.speaker]: emotion } : {};
      const characters = charsFor([...new Set(ids)], framing, emotionById);
      planned.push({
        sceneId: scene.id,
        purpose: narr ? `Narration: ${g.lines[0].text.slice(0, 60)}` : `${castById.get(g.speaker!)?.name ?? 'Character'} speaks (${emotion})`,
        durationSec: Math.round(Math.max(2.5, Math.min(12, speech + 0.9)) * 10) / 10,
        dialogueLineIds: g.lines.map((l) => l.id),
        characters,
        environmentId: scene.environmentId,
        camera: ShotCamera.parse({ framing, move: framing === 'closeup' ? (emotional ? 'push-in' : 'static') : narr ? 'pan-left' : 'static', focusX: characters.find((c) => c.characterId === g.speaker)?.x ?? 0.5 }),
        effects: baseFx(),
        transitionIn: 'cut',
        mode: 'A',
        motionScore: emotional ? 0.6 : 0.2,
        isEstablishing: false,
        imagePrompt: `${styleText}. ${framing} shot of ${describe(ids)} in ${envName}. ${g.lines[0].text}`,
        motionPrompt: `${describe(ids)} talking, ${emotion} expression, subtle gestures.`,
        sfxTags: [],
      });
    });
    planned.push(...actionShots);
  });

  // 3. Assign animation modes to approximate the project's mix ratios (by duration).
  const total = planned.reduce((a, s) => a + s.durationSec, 0);
  const mix = project.mix;
  let bBudget = total * mix.B;
  for (const s of [...planned].filter((s) => !s.isEstablishing).sort((a, b) => b.motionScore - a.motionScore)) {
    if (bBudget <= 0 || s.motionScore < 0.5) break;
    s.mode = 'B';
    bBudget -= s.durationSec;
  }
  let cBudget = total * mix.C;
  for (const s of planned.filter((s) => s.isEstablishing)) {
    if (cBudget <= 0) break;
    s.mode = 'C';
    cBudget -= s.durationSec;
  }

  // SFX assets by tag from the shared library
  const sfxAssets = listAssets({ category: 'sfx', projectId: undefined });
  const sfxFor = (tags: string[]) =>
    tags
      .map((t) => sfxAssets.find((a) => a.tags.includes(t)))
      .filter(Boolean)
      .map((a, i) => ({ assetId: a!.id, at: i === 0 ? 0.35 : 0.1, volume: 0.9 }));

  const videoModel = 'mock/image-to-video';
  const imageModel = 'mock/image';
  db.transaction((tx) => {
    tx.delete(schema.shots).where(eq(schema.shots.projectId, projectId)).run();
    planned.forEach((p, i) =>
      tx
        .insert(schema.shots)
        .values({
          id: newId('sht'),
          projectId,
          sceneId: p.sceneId,
          seq: i + 1,
          purpose: p.purpose,
          durationSec: p.durationSec,
          dialogueLineIds: p.dialogueLineIds,
          characters: p.characters,
          environmentId: p.environmentId,
          camera: p.camera,
          effects: p.effects,
          transitionIn: p.transitionIn,
          sfx: sfxFor(p.sfxTags),
          references: [],
          mode: p.mode,
          imagePrompt: p.imagePrompt,
          motionPrompt: p.motionPrompt,
          negativePrompt: 'extra limbs, morphing face, inconsistent outfit, text, watermark, photorealistic',
          imageModel,
          videoModel,
          generation: GenerationSettings.parse({ quality: 'draft' }),
        })
        .run(),
    );
  });
  refreshEstimates(projectId);
  advanceStage(projectId);
  void preset;
  return listShots(projectId);
}

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

export function listShots(projectId: string) {
  const db = getDb();
  const scenes = db.select().from(schema.scenes).where(eq(schema.scenes.projectId, projectId)).all();
  const sceneSeq = new Map(scenes.map((s) => [s.id, s.seq]));
  const shots = db.select().from(schema.shots).where(eq(schema.shots.projectId, projectId)).all();
  const ids = shots.map((s) => s.id);
  const versions = ids.length ? db.select().from(schema.shotVersions).where(inArray(schema.shotVersions.shotId, ids)).orderBy(asc(schema.shotVersions.version)).all() : [];
  return shots
    .sort((a, b) => (sceneSeq.get(a.sceneId)! - sceneSeq.get(b.sceneId)!) || a.seq - b.seq)
    .map((s) => ({ ...s, sceneSeq: sceneSeq.get(s.sceneId)!, versions: versions.filter((v) => v.shotId === s.id) }));
}

export function getShot(id: string): Shot {
  const s = getDb().select().from(schema.shots).where(eq(schema.shots.id, id)).get();
  if (!s) throw new Error(`Shot ${id} not found`);
  return s;
}

// ---------------------------------------------------------------------------------------------
// Edits: CREATE / EDIT / DUPLICATE / REORDER / APPROVE / REJECT / REPLACE
// ---------------------------------------------------------------------------------------------

export const ShotUpdate = z.object({
  purpose: z.string().max(500).optional(),
  durationSec: z.number().min(0.5).max(30).optional(),
  dialogueLineIds: z.array(z.string()).optional(),
  characters: z.array(ShotCharacter).max(6).optional(),
  environmentId: z.string().nullable().optional(),
  camera: ShotCamera.optional(),
  effects: ShotEffects.optional(),
  transitionIn: z.enum(TRANSITIONS).optional(),
  mode: z.enum(SHOT_MODES).optional(),
  imagePrompt: z.string().max(4000).optional(),
  motionPrompt: z.string().max(4000).optional(),
  negativePrompt: z.string().max(2000).optional(),
  imageModel: z.string().optional(),
  videoModel: z.string().optional(),
  generation: GenerationSettings.optional(),
  sfx: z.array(z.object({ assetId: z.string(), at: z.number().min(0).max(1), volume: z.number().min(0).max(2) })).optional(),
  references: z.array(z.string()).optional(),
  trimStartSec: z.number().min(0).max(60).optional(),
  sceneId: z.string().optional(),
});

export function updateShot(id: string, raw: z.input<typeof ShotUpdate>) {
  const patch = ShotUpdate.parse(raw);
  const shot = getShot(id);
  if (patch.imageModel) getModel(patch.imageModel);
  if (patch.videoModel) getModel(patch.videoModel);
  // Editing an approved shot's plan sends it back to review, but its approved footage versions are kept.
  const planChanged = Object.keys(patch).some((k) => !['trimStartSec'].includes(k));
  getDb()
    .update(schema.shots)
    .set({ ...patch, ...(planChanged && shot.approval === 'approved' ? { approval: 'pending' } : {}), updatedAt: nowIso() })
    .where(eq(schema.shots.id, id))
    .run();
  refreshEstimates(shot.projectId);
  advanceStage(shot.projectId);
  return getShot(id);
}

export function createShot(projectId: string, sceneId: string, afterShotId?: string) {
  const db = getDb();
  const scene = db.select().from(schema.scenes).where(eq(schema.scenes.id, sceneId)).get();
  if (!scene || scene.projectId !== projectId) throw new Error('Scene not found in project');
  const sceneShots = db.select().from(schema.shots).where(eq(schema.shots.sceneId, sceneId)).orderBy(asc(schema.shots.seq)).all();
  const after = afterShotId ? sceneShots.find((s) => s.id === afterShotId) : sceneShots[sceneShots.length - 1];
  const seq = after ? after.seq + 1 : 1;
  db.update(schema.shots).set({ seq: sql`${schema.shots.seq} + 1` }).where(and(eq(schema.shots.projectId, projectId), sql`${schema.shots.seq} >= ${seq}`)).run();
  const id = newId('sht');
  db.insert(schema.shots)
    .values({
      id,
      projectId,
      sceneId,
      seq,
      purpose: 'New shot',
      durationSec: 4,
      dialogueLineIds: [],
      characters: [],
      environmentId: scene.environmentId,
      camera: ShotCamera.parse({}),
      effects: ShotEffects.parse({}),
      sfx: [],
      references: [],
      generation: GenerationSettings.parse({}),
    })
    .run();
  normalizeSeq(projectId);
  advanceStage(projectId);
  return id;
}

export function duplicateShot(id: string) {
  const db = getDb();
  const s = getShot(id);
  db.update(schema.shots).set({ seq: sql`${schema.shots.seq} + 1` }).where(and(eq(schema.shots.projectId, s.projectId), sql`${schema.shots.seq} > ${s.seq}`)).run();
  const newIdv = newId('sht');
  // Duplicates start as pending with no generated versions (versions belong to the original shot).
  db.insert(schema.shots)
    .values({ ...s, id: newIdv, seq: s.seq + 1, approval: 'pending', activeVersionId: null, startImageVersionId: null, thumbnailAssetId: s.thumbnailAssetId, actualCostUsd: 0, purpose: `${s.purpose} (copy)`, createdAt: nowIso(), updatedAt: nowIso() })
    .run();
  normalizeSeq(s.projectId);
  advanceStage(s.projectId);
  return newIdv;
}

export function deleteShot(id: string) {
  const s = getShot(id);
  if (s.approval === 'approved') throw new Error('Approved shots cannot be deleted. Reject it first.');
  getDb().delete(schema.shots).where(eq(schema.shots.id, id)).run();
  normalizeSeq(s.projectId);
  advanceStage(s.projectId);
}

/** Reorder all shots of a project. Shots may move between scenes by passing sceneId updates separately. */
export function reorderShots(projectId: string, orderedIds: string[]) {
  const db = getDb();
  const existing = db.select({ id: schema.shots.id }).from(schema.shots).where(eq(schema.shots.projectId, projectId)).all().map((r) => r.id);
  if (existing.length !== orderedIds.length || new Set(orderedIds).size !== orderedIds.length || !existing.every((id) => orderedIds.includes(id)))
    throw new Error('Reorder list must contain every shot exactly once');
  db.transaction((tx) => orderedIds.forEach((id, i) => tx.update(schema.shots).set({ seq: i + 1 }).where(eq(schema.shots.id, id)).run()));
  advanceStage(projectId);
}

export function moveShot(id: string, direction: -1 | 1) {
  const s = getShot(id);
  const ordered = listShots(s.projectId);
  const idx = ordered.findIndex((x) => x.id === id);
  const j = idx + direction;
  if (j < 0 || j >= ordered.length) return;
  const other = ordered[j];
  if (other.sceneId !== s.sceneId) {
    // crossing a scene boundary moves the shot into the neighbouring scene
    getDb().update(schema.shots).set({ sceneId: other.sceneId }).where(eq(schema.shots.id, id)).run();
  }
  const ids = ordered.map((x) => x.id);
  [ids[idx], ids[j]] = [ids[j], ids[idx]];
  reorderShots(s.projectId, ids);
}

function normalizeSeq(projectId: string) {
  const ordered = listShots(projectId);
  const db = getDb();
  ordered.forEach((s, i) => db.update(schema.shots).set({ seq: i + 1 }).where(eq(schema.shots.id, s.id)).run());
}

export function setShotApproval(id: string, approval: 'approved' | 'rejected' | 'pending') {
  const s = getShot(id);
  getDb().update(schema.shots).set({ approval, updatedAt: nowIso() }).where(eq(schema.shots.id, id)).run();
  advanceStage(s.projectId);
}

// ---------------------------------------------------------------------------------------------
// Versions (per-shot history; approved originals are never deleted or overwritten)
// ---------------------------------------------------------------------------------------------

export function addShotVersion(shotId: string, v: { kind: 'start_image' | 'video' | 'still'; assetId: string; jobId?: string | null; source: 'mock' | 'provider' | 'upload'; note?: string }) {
  const db = getDb();
  const shot = getShot(shotId);
  const max = db
    .select({ m: sql<number>`coalesce(max(${schema.shotVersions.version}),0)` })
    .from(schema.shotVersions)
    .where(and(eq(schema.shotVersions.shotId, shotId), eq(schema.shotVersions.kind, v.kind)))
    .get()?.m ?? 0;
  const id = newId('ver');
  db.insert(schema.shotVersions).values({ id, shotId, version: max + 1, kind: v.kind, assetId: v.assetId, jobId: v.jobId ?? null, source: v.source, note: v.note ?? '' }).run();
  // Fill empty slots with the new candidate, but never displace an approved version automatically.
  if (v.kind === 'start_image') {
    const cur = shot.startImageVersionId ? db.select().from(schema.shotVersions).where(eq(schema.shotVersions.id, shot.startImageVersionId)).get() : null;
    if (!cur || cur.status !== 'approved') db.update(schema.shots).set({ startImageVersionId: id }).where(eq(schema.shots.id, shotId)).run();
  } else {
    const cur = shot.activeVersionId ? db.select().from(schema.shotVersions).where(eq(schema.shotVersions.id, shot.activeVersionId)).get() : null;
    if (!cur || cur.status !== 'approved') db.update(schema.shots).set({ activeVersionId: id }).where(eq(schema.shots.id, shotId)).run();
  }
  return id;
}

export function setVersionStatus(versionId: string, status: 'approved' | 'rejected' | 'candidate') {
  const db = getDb();
  const v = db.select().from(schema.shotVersions).where(eq(schema.shotVersions.id, versionId)).get();
  if (!v) throw new Error('Version not found');
  db.update(schema.shotVersions).set({ status }).where(eq(schema.shotVersions.id, versionId)).run();
  if (status === 'approved') useVersion(versionId);
}

/** Make a version the active one for its shot (also used to revert to an earlier good result). */
export function useVersion(versionId: string) {
  const db = getDb();
  const v = db.select().from(schema.shotVersions).where(eq(schema.shotVersions.id, versionId)).get();
  if (!v) throw new Error('Version not found');
  if (v.status === 'rejected') throw new Error('Cannot use a rejected version; un-reject it first');
  if (v.kind === 'start_image') db.update(schema.shots).set({ startImageVersionId: v.id, updatedAt: nowIso() }).where(eq(schema.shots.id, v.shotId)).run();
  else db.update(schema.shots).set({ activeVersionId: v.id, updatedAt: nowIso() }).where(eq(schema.shots.id, v.shotId)).run();
}

/** REPLACE: import user footage/still as a new shot version. */
export function replaceWithAsset(shotId: string, assetId: string) {
  const a = getAsset(assetId);
  if (!a) throw new Error('Asset not found');
  if (a.kind !== 'video' && a.kind !== 'image') throw new Error('Replacement must be video or image');
  const kind = a.kind === 'video' ? 'video' : 'still';
  const id = addShotVersion(shotId, { kind, assetId, source: 'upload', note: `Replaced with ${a.name}` });
  useVersion(id);
  if (kind === 'video') getDb().update(schema.shots).set({ mode: 'B' }).where(eq(schema.shots.id, shotId)).run();
  else getDb().update(schema.shots).set({ mode: 'C' }).where(eq(schema.shots.id, shotId)).run();
  return id;
}

// ---------------------------------------------------------------------------------------------
// Cost estimates + generation requests
// ---------------------------------------------------------------------------------------------

export function estimateShotCost(shot: Shot) {
  if (shot.mode !== 'B') return 0;
  const project = requireProject(shot.projectId);
  const img = getModel(shot.imageModel).adapter.estimateCost({ kind: 'image', modelId: shot.imageModel, idempotencyKey: '', width: project.width, height: project.height });
  const vid = getModel(shot.videoModel).adapter.estimateCost({
    kind: 'video',
    modelId: shot.videoModel,
    idempotencyKey: '',
    width: project.width,
    height: project.height,
    durationSec: shot.durationSec,
    quality: shot.generation.quality,
  });
  return Math.round((img.usd + vid.usd) * 100) / 100;
}

export function refreshEstimates(projectId: string) {
  const db = getDb();
  for (const s of db.select().from(schema.shots).where(eq(schema.shots.projectId, projectId)).all()) {
    let est = 0;
    try {
      est = estimateShotCost(s);
    } catch {
      est = 0;
    }
    if (est !== s.estimatedCostUsd) db.update(schema.shots).set({ estimatedCostUsd: est }).where(eq(schema.shots.id, s.id)).run();
  }
}

export function storyboardCostSummary(projectId: string) {
  const shots = listShots(projectId);
  const byMode = { A: 0, B: 0, C: 0 } as Record<ShotMode, number>;
  for (const s of shots) byMode[s.mode as ShotMode] += s.durationSec;
  const total = shots.reduce((a, s) => a + s.durationSec, 0) || 1;
  return {
    shots: shots.length,
    durationSec: Math.round(total * 10) / 10,
    estimatedUsd: Math.round(shots.reduce((a, s) => a + s.estimatedCostUsd, 0) * 100) / 100,
    mixActual: { A: byMode.A / total, B: byMode.B / total, C: byMode.C / total },
  };
}

/** Keyframe spec for a shot at given size — used for storyboard thumbnails and mock start images. */
export function shotKeyframeSpec(shot: Shot, width: number, height: number): KeyframeSpec {
  const db = getDb();
  const env = shot.environmentId ? db.select().from(schema.environments).where(eq(schema.environments.id, shot.environmentId)).get() : undefined;
  const allLayers = environmentLayersFor(shot.environmentId);
  const isFront = (role: string) => role === 'foreground' || role === 'overlay';
  const layers = allLayers.filter((r) => !isFront(r.l.role));
  const place = framingPlacement(shot.camera.framing, width / height);
  const chars = shot.characters
    .map((sc) => {
      const c = db.select().from(schema.characters).where(eq(schema.characters.id, sc.characterId)).get();
      if (!c?.rig) return null;
      const body = c.rig.poses[sc.pose] ?? Object.values(c.rig.poses)[0];
      const face = c.rig.faces[sc.expression] ?? c.rig.faces.neutral ?? Object.values(c.rig.faces)[0];
      const ids = [body, face, c.rig.mouths?.closed].filter(Boolean) as string[];
      return { layers: ids.map((id) => assetAbsPath(id)), x: sc.x, footY: place.footY, heightFrac: place.heightFrac, flip: sc.flip };
    })
    .filter(Boolean) as KeyframeSpec['characters'];
  const cam = cameraKeys(shot.camera.move, shot.camera.intensity);
  return {
    width,
    height,
    backgroundColor: env?.backgroundColor ?? '#1b1f2a',
    layers: layers.map((r) => assetAbsPath(r.a)),
    frontLayers: allLayers.filter((r) => isFront(r.l.role)).map((r) => assetAbsPath(r.a)),
    characters: chars,
    zoom: cam.from.zoom,
    focusX: shot.camera.focusX,
    tint: shot.effects.tint ? { color: shot.effects.tint, opacity: shot.effects.tintOpacity } : null,
  };
}

export async function renderShotThumbnail(shotId: string) {
  const shot = getShot(shotId);
  const project = requireProject(shot.projectId);
  const w = project.width >= project.height ? 640 : 360;
  const h = project.width >= project.height ? 360 : 640;
  const out = tmpFile('.png');
  await renderKeyframe({ ...shotKeyframeSpec(shot, w, h), badge: `#${shot.seq} · ${shot.mode}` }, out);
  const asset = await importAsset({
    sourcePath: out,
    originalName: `thumb-${shot.id}.png`,
    category: 'thumbnail',
    projectId: shot.projectId,
    provenance: { source: 'render', note: 'Storyboard keyframe (sharp compositor)' },
    move: true,
    parentAssetId: shot.thumbnailAssetId,
  });
  getDb().update(schema.shots).set({ thumbnailAssetId: asset.id }).where(eq(schema.shots.id, shotId)).run();
  return asset.id;
}

function generationGate(shot: Shot) {
  requireApproved(shot.projectId, 'art');
  requireApproved(shot.projectId, 'storyboard');
}

function hasApprovedVersion(shot: Shot, kind: 'start_image' | 'video') {
  const id = kind === 'start_image' ? shot.startImageVersionId : shot.activeVersionId;
  if (!id) return false;
  const v = getDb().select().from(schema.shotVersions).where(eq(schema.shotVersions.id, id)).get();
  return v?.status === 'approved';
}

/** Request a start image (step 1 of Mode B). Creates a job AWAITING_APPROVAL when it has a cost. */
export function requestStartImage(shotId: string, opts: { regenerate?: boolean; variant?: number } = {}): { job: Job; duplicate: boolean } {
  const shot = getShot(shotId);
  generationGate(shot);
  if (hasApprovedVersion(shot, 'start_image') && !opts.regenerate) throw new Error('This shot already has an approved start image. Explicitly choose "Regenerate" to create a new variation.');
  const project = requireProject(shot.projectId);
  const refs = shot.characters.flatMap((c) => approvedReferences(c.characterId).map((v) => assetAbsPath(v.assetId)));
  return createJob({
    projectId: shot.projectId,
    shotId,
    sceneId: shot.sceneId,
    kind: 'image',
    modelId: shot.imageModel,
    isRevision: !!opts.regenerate,
    variant: opts.variant,
    budgetCategory: 'image',
    request: {
      kind: 'image',
      prompt: shot.imagePrompt,
      negativePrompt: shot.negativePrompt,
      referenceImages: refs,
      width: project.width,
      height: project.height,
      seed: shot.generation.seed,
      mockScenario: shot.generation.mockScenario,
      keyframe: shotKeyframeSpec(shot, project.width, project.height),
    },
  });
}

/** Request image-to-video from the APPROVED start image (step 2 of Mode B). */
export function requestShotVideo(shotId: string, opts: { regenerate?: boolean; variant?: number } = {}): { job: Job; duplicate: boolean } {
  const shot = getShot(shotId);
  generationGate(shot);
  if (shot.mode !== 'B') throw new Error('Only Mode B shots use AI image-to-video');
  if (!hasApprovedVersion(shot, 'start_image')) throw new Error('Approve a start image first (Mode B: approve the still, then animate it)');
  if (hasApprovedVersion(shot, 'video') && !opts.regenerate) throw new Error('This shot already has approved footage. Explicitly choose "Regenerate" to make a new variation.');
  const startV = getDb().select().from(schema.shotVersions).where(eq(schema.shotVersions.id, shot.startImageVersionId!)).get()!;
  const project = requireProject(shot.projectId);
  const caps = getModel(shot.videoModel).caps;
  const dur = Math.max(caps.durationSec?.min ?? 2, Math.min(caps.durationSec?.max ?? 10, Math.ceil(shot.durationSec)));
  return createJob({
    projectId: shot.projectId,
    shotId,
    sceneId: shot.sceneId,
    kind: 'video',
    modelId: shot.videoModel,
    isRevision: !!opts.regenerate,
    variant: opts.variant,
    budgetCategory: 'video',
    request: {
      kind: 'video',
      prompt: shot.motionPrompt,
      negativePrompt: shot.negativePrompt,
      imagePath: assetAbsPath(startV.assetId),
      width: project.width,
      height: project.height,
      durationSec: dur,
      quality: shot.generation.quality,
      seed: shot.generation.seed,
      mockScenario: shot.generation.mockScenario,
    },
  });
}

export function shotsNeedingAi(projectId: string) {
  return listShots(projectId).filter((s) => s.mode === 'B');
}

export function storyboardApproved(projectId: string) {
  return isApproved(projectId, 'storyboard');
}

export function latestVersions(shotId: string) {
  return getDb().select().from(schema.shotVersions).where(eq(schema.shotVersions.shotId, shotId)).orderBy(desc(schema.shotVersions.createdAt)).all();
}

export function cleanupTmp(p: string) {
  if (p && fs.existsSync(p) && p.includes(`${path.sep}tmp${path.sep}`)) fs.rmSync(p, { force: true });
}
