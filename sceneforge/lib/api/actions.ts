/**
 * Typed RPC action registry. Every UI button calls one of these through POST /api/rpc/<name>.
 * Inputs are validated with Zod; handlers call the domain services.
 */
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { newId } from '../ids';
import { CHECKPOINTS, DEFAULT_TRACK_SETTINGS } from '../types';
import * as story from '../story/service';
import { generateTemplateDraft, parseScript, draftToScript } from '../story/draft';
import * as approvals from '../approvals/service';
import * as chars from '../characters/service';
import * as envs from '../environments/service';
import * as shots from '../shots/service';
import * as audio from '../audio/service';
import * as queue from '../jobs/queue';
import * as budget from '../budget/service';
import * as timeline from '../timeline/builder';
import * as exp from '../rendering/export';
import { DEMO_SCRIPT, ensureDemoLibrary } from '../demo/seed';

type Handler<S extends z.ZodTypeAny> = { input: S; run: (input: z.infer<S>) => unknown | Promise<unknown> };
const a = <S extends z.ZodTypeAny>(input: S, run: (input: z.infer<S>) => unknown | Promise<unknown>): Handler<S> => ({ input, run });

const id = z.string().min(1).max(64);
const P = z.object({ projectId: id });
const checkpoint = z.enum(CHECKPOINTS);

export const actions = {
  // ---- projects / series
  'project.create': a(story.CreateProjectInput, (i) => story.createProject(i)),
  'project.update': a(P.extend({ patch: story.UpdateProjectInput }), (i) => story.updateProject(i.projectId, i.patch)),
  'project.delete': a(P, (i) => story.deleteProject(i.projectId)),
  'series.create': a(z.object({ name: z.string().min(1).max(100), description: z.string().max(1000).default('') }), (i) => {
    const sid = newId('ser');
    getDb().insert(schema.series).values({ id: sid, ...i }).run();
    return { id: sid };
  }),

  // ---- story
  'story.generate': a(P.extend({ idea: z.string().min(3).max(20000), presetId: z.string().optional() }), (i) => {
    const p = story.requireProject(i.projectId);
    const cast = story.getCast(i.projectId).map((c) => c.name);
    const draft = generateTemplateDraft({ idea: i.idea, presetId: i.presetId ?? p.preset, targetDurationSec: p.targetDurationSec, castNames: cast.length ? cast : undefined, title: p.title });
    story.updateProject(i.projectId, { sourceInput: i.idea });
    return story.applyStoryDraft(i.projectId, draft);
  }),
  'story.applyScript': a(P.extend({ script: z.string().min(1).max(200000) }), (i) => {
    const draft = parseScript(i.script);
    return story.applyStoryDraft(i.projectId, draft);
  }),
  'story.exportScript': a(P, (i) => {
    const d = story.storyAsDraft(i.projectId);
    return { script: d ? draftToScript(d) : '' };
  }),
  'scene.update': a(z.object({ sceneId: id, patch: story.SceneUpdate }), (i) => story.updateScene(i.sceneId, i.patch)),
  'scene.add': a(P.extend({ title: z.string().min(1).max(200) }), (i) => story.addScene(i.projectId, i.title)),
  'scene.delete': a(z.object({ sceneId: id }), (i) => story.deleteScene(i.sceneId)),
  'scene.move': a(P.extend({ sceneId: id, direction: z.union([z.literal(-1), z.literal(1)]) }), (i) => {
    const ids = story.getStory(i.projectId).scenes.map((s) => s.id);
    const k = ids.indexOf(i.sceneId);
    const j = k + i.direction;
    if (k < 0 || j < 0 || j >= ids.length) return;
    [ids[k], ids[j]] = [ids[j], ids[k]];
    story.reorderScenes(i.projectId, ids);
  }),
  'scene.setAudio': a(z.object({ sceneId: id, music: z.string().max(64).default(''), ambience: z.string().max(64).default('') }), (i) =>
    getDb().update(schema.scenes).set({ music: i.music, ambience: i.ambience }).where(eq(schema.scenes.id, i.sceneId)).run(),
  ),
  'line.upsert': a(story.LineUpsert, (i) => story.upsertLine(i)),
  'line.delete': a(z.object({ lineId: id }), (i) => story.deleteLine(i.lineId)),
  'line.move': a(z.object({ lineId: id, direction: z.union([z.literal(-1), z.literal(1)]) }), (i) => story.moveLine(i.lineId, i.direction)),
  'styleBible.update': a(P.extend({ patch: z.object({ artStyle: z.string().max(500).optional(), palette: z.array(z.string()).max(12).optional(), lineWork: z.string().max(500).optional(), lighting: z.string().max(500).optional(), cameraLanguage: z.string().max(500).optional(), notes: z.string().max(4000).optional() }) }), (i) =>
    story.updateStyleBible(i.projectId, i.patch),
  ),

  // ---- approvals
  'checkpoint.approve': a(P.extend({ checkpoint: z.enum(['story', 'art', 'storyboard', 'final']), note: z.string().max(1000).default('') }), (i) => approvals.approveCheckpoint(i.projectId, i.checkpoint, i.note)),
  'checkpoint.reject': a(P.extend({ checkpoint, note: z.string().max(1000).default('') }), (i) => approvals.rejectCheckpoint(i.projectId, i.checkpoint, i.note)),
  'checkpoint.revoke': a(P.extend({ checkpoint, note: z.string().max(1000).default('') }), (i) => approvals.revokeCheckpoint(i.projectId, i.checkpoint, i.note)),

  // ---- characters
  'character.create': a(chars.CharacterInput, (i) => chars.createCharacter(i)),
  'character.update': a(z.object({ characterId: id, patch: z.record(z.string(), z.unknown()) }), (i) => chars.updateCharacter(i.characterId, i.patch as never)),
  'character.delete': a(z.object({ characterId: id }), (i) => chars.deleteCharacter(i.characterId)),
  'character.addVariant': a(z.object({ characterId: id, kind: z.enum(chars.VARIANT_KINDS), name: z.string().min(1).max(60), assetId: id }), (i) => chars.addVariant(i.characterId, i)),
  'character.variantApproval': a(z.object({ variantId: id, approved: z.boolean() }), (i) => chars.setVariantApproval(i.variantId, i.approved)),
  'character.removeVariant': a(z.object({ variantId: id }), (i) => chars.removeVariant(i.variantId)),
  'character.rebuildRig': a(z.object({ characterId: id }), (i) => chars.rebuildRig(i.characterId)),
  'character.setLocked': a(z.object({ characterId: id, locked: z.boolean() }), (i) => chars.setLocked(i.characterId, i.locked)),
  'character.continuity': a(z.object({ characterId: id, item: z.string().max(80), checked: z.boolean() }), (i) => chars.setContinuity(i.characterId, i.item, i.checked)),
  'character.addToProject': a(P.extend({ characterId: id, role: z.string().max(40).default('supporting') }), (i) => chars.addToProject(i.projectId, i.characterId, i.role)),
  'character.removeFromProject': a(P.extend({ characterId: id }), (i) => chars.removeFromProject(i.projectId, i.characterId)),

  // ---- environments
  'environment.create': a(envs.EnvironmentInput, (i) => envs.createEnvironment(i)),
  'environment.update': a(z.object({ environmentId: id, patch: z.record(z.string(), z.unknown()) }), (i) => envs.updateEnvironment(i.environmentId, i.patch as never)),
  'environment.addLayer': a(z.object({ environmentId: id, assetId: id, role: z.enum(envs.LAYER_ROLES), parallax: z.number().min(0).max(3).optional(), needsReview: z.boolean().optional() }), (i) => envs.addLayer(i.environmentId, i)),
  'environment.updateLayer': a(z.object({ layerId: id, parallax: z.number().min(0).max(3).optional(), order: z.number().int().optional(), needsReview: z.boolean().optional() }), (i) => envs.updateLayer(i.layerId, i)),
  'environment.removeLayer': a(z.object({ layerId: id }), (i) => envs.removeLayer(i.layerId)),
  'environment.lightingVariant': a(z.object({ environmentId: id, name: z.string().min(1).max(100), timeOfDay: z.enum(['day', 'sunset', 'night', 'dawn', 'interior']), tint: z.string().max(20), tintOpacity: z.number().min(0).max(1) }), (i) => envs.createLightingVariant(i.environmentId, i)),
  'environment.setLocked': a(z.object({ environmentId: id, locked: z.boolean() }), (i) => envs.setEnvironmentLocked(i.environmentId, i.locked)),
  'scene.assignEnvironment': a(z.object({ sceneId: id, environmentId: id.nullable() }), (i) => {
    envs.assignSceneEnvironment(i.sceneId, i.environmentId);
    const s = getDb().select().from(schema.scenes).where(eq(schema.scenes.id, i.sceneId)).get();
    if (s) approvals.advanceStage(s.projectId);
  }),

  // ---- shots / storyboard
  'shots.plan': a(P.extend({ replace: z.boolean().default(false) }), (i) => shots.planShots(i.projectId, { replace: i.replace }).length),
  'shot.update': a(z.object({ shotId: id, patch: shots.ShotUpdate }), (i) => shots.updateShot(i.shotId, i.patch)),
  'shot.create': a(P.extend({ sceneId: id, afterShotId: id.optional() }), (i) => shots.createShot(i.projectId, i.sceneId, i.afterShotId)),
  'shot.duplicate': a(z.object({ shotId: id }), (i) => shots.duplicateShot(i.shotId)),
  'shot.delete': a(z.object({ shotId: id }), (i) => shots.deleteShot(i.shotId)),
  'shot.move': a(z.object({ shotId: id, direction: z.union([z.literal(-1), z.literal(1)]) }), (i) => shots.moveShot(i.shotId, i.direction)),
  'shot.setApproval': a(z.object({ shotId: id, approval: z.enum(['approved', 'rejected', 'pending']) }), (i) => shots.setShotApproval(i.shotId, i.approval)),
  'shot.requestStartImage': a(z.object({ shotId: id, regenerate: z.boolean().default(false) }), (i) => shots.requestStartImage(i.shotId, { regenerate: i.regenerate, variant: i.regenerate ? Date.now() : undefined })),
  'shot.requestVideo': a(z.object({ shotId: id, regenerate: z.boolean().default(false) }), (i) => shots.requestShotVideo(i.shotId, { regenerate: i.regenerate, variant: i.regenerate ? Date.now() : undefined })),
  'shot.versionStatus': a(z.object({ versionId: id, status: z.enum(['approved', 'rejected', 'candidate']) }), (i) => shots.setVersionStatus(i.versionId, i.status)),
  'shot.useVersion': a(z.object({ versionId: id }), (i) => shots.useVersion(i.versionId)),
  'shot.replace': a(z.object({ shotId: id, assetId: id }), (i) => shots.replaceWithAsset(i.shotId, i.assetId)),
  'storyboard.renderFrames': a(P.extend({ shotIds: z.array(id).optional() }), (i) =>
    queue.createJob({ projectId: i.projectId, kind: 'storyboard_frames', input: i.shotIds ? { shotIds: i.shotIds } : {}, variant: Date.now() }).job.id,
  ),

  // ---- audio
  'audio.generate': a(P.extend({ lineIds: z.array(id).optional(), regenerate: z.boolean().default(false) }), (i) => audio.requestDialogueAudio(i.projectId, i)),
  'audio.importLine': a(z.object({ lineId: id, assetId: id }), (i) => audio.importLineRecording(i.lineId, i.assetId)),
  'audio.useSegment': a(z.object({ lineId: id, segmentId: id }), (i) => audio.useAudioSegment(i.lineId, i.segmentId)),
  'audio.setNarratorVoice': a(P.extend({ modelId: z.string().max(80), voiceId: z.string().max(80) }), (i) => audio.setNarratorVoice(i.projectId, i)),

  // ---- jobs
  'jobs.approve': a(P.extend({ jobIds: z.array(id).min(1).max(200), note: z.string().max(1000).default('') }), (i) => queue.approveJobs(i.projectId, i.jobIds, i.note)),
  'jobs.reject': a(z.object({ jobIds: z.array(id).min(1).max(200) }), (i) => queue.rejectJobs(i.jobIds)),
  'job.cancel': a(z.object({ jobId: id }), (i) => queue.cancelJob(i.jobId)),
  'job.reconcile': a(z.object({ jobId: id, action: z.enum(['check_provider', 'not_billed_retry', 'billed_failed', 'cancel_not_billed']) }), (i) => queue.resolveReconciliation(i.jobId, i.action)),
  'jobs.list': a(z.object({ projectId: id.optional(), limit: z.number().int().min(1).max(500).default(100) }), (i) => queue.listJobs({ projectId: i.projectId, limit: i.limit })),

  // ---- editor / timeline / export
  'timeline.build': a(P, (i) => {
    const row = timeline.saveTimeline(i.projectId);
    approvals.advanceStage(i.projectId);
    return { id: row.id, version: row.version, timeline: row.data };
  }),
  'editor.update': a(
    P.extend({
      tracks: z
        .object({
          dialogue: z.object({ volume: z.number().min(0).max(2), muted: z.boolean() }),
          music: z.object({ volume: z.number().min(0).max(2), muted: z.boolean(), duckUnderDialogue: z.boolean(), duckAmountDb: z.number().min(0).max(30) }),
          sfx: z.object({ volume: z.number().min(0).max(2), muted: z.boolean() }),
          ambience: z.object({ volume: z.number().min(0).max(2), muted: z.boolean() }),
          burnInSubtitles: z.boolean(),
        })
        .optional(),
      musicAssetId: id.nullable().optional(),
      ambienceAssetId: id.nullable().optional(),
      musicFadeSec: z.number().min(0).max(10).optional(),
      transitionFrames: z.number().int().min(0).max(48).optional(),
    }),
    (i) => {
      const { projectId, ...patch } = i;
      timeline.updateEditorSettings(projectId, patch);
    },
  ),
  'editor.resetTracks': a(P, (i) => timeline.updateEditorSettings(i.projectId, { tracks: structuredClone(DEFAULT_TRACK_SETTINGS) })),
  'export.request': a(P.extend({ kind: z.enum(['final', 'preview']), sceneId: id.optional(), scale: z.number().min(0.25).max(1).optional() }), (i) => exp.requestExport(i.projectId, i.kind, { sceneId: i.sceneId, scale: i.scale })),

  // ---- budget
  'budget.update': a(budget.BudgetSettingsInput, (i) => budget.updateBudgetSettings(i)),
  'budget.resetSimulated': a(z.object({}), () => budget.resetSimulatedSpend()),

  // ---- demo
  'demo.createProject': a(z.object({}), async () => {
    await ensureDemoLibrary();
    const series = getDb().select().from(schema.series).where(eq(schema.series.name, 'Hillmoor Tales')).get();
    const p = story.createProject({ title: 'The Lantern Courier (interactive)', presetId: 'adventure', targetDurationSec: 120, seriesId: series?.id ?? null, sourceKind: 'script', sourceInput: DEMO_SCRIPT });
    story.applyStoryDraft(p.id, parseScript(DEMO_SCRIPT));
    return { projectId: p.id };
  }),
} satisfies Record<string, Handler<z.ZodTypeAny>>;

export type ActionName = keyof typeof actions;
