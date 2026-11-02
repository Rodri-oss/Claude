import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { hashOf, newId } from '../ids';
import { requireApproved } from '../approvals/service';
import { createJob } from '../jobs/queue';
import { defaultTtsModel, getModel } from '../providers/registry';
import { requireProject } from '../story/service';
import { assetAbsPath, getAsset, importAsset } from '../assets/service';
import { probe } from '../media/ffmpeg';
import { mouthCuesForFile } from './mouth';
import type { NormalizedOutput } from '../providers/types';

export const lineTextHash = (l: { text: string; emotion: string; speed: number; pronunciation: Record<string, string>; characterId: string | null }, voice: string) =>
  hashOf({ t: l.text, e: l.emotion, s: l.speed, p: l.pronunciation, c: l.characterId, v: voice });

function settingKey(projectId: string) {
  return `voice.narrator.${projectId}`;
}

export function getNarratorVoice(projectId: string): { modelId: string; voiceId: string } {
  const row = getDb().select().from(schema.appSettings).where(eq(schema.appSettings.key, settingKey(projectId))).get();
  const model = defaultTtsModel();
  return (row?.value as { modelId: string; voiceId: string }) ?? { modelId: model, voiceId: model === 'local/espeak-ng' ? 'en-us+klatt3' : 'mock-mid' };
}

export function setNarratorVoice(projectId: string, v: { modelId: string; voiceId: string }) {
  getModel(v.modelId);
  getDb()
    .insert(schema.appSettings)
    .values({ key: settingKey(projectId), value: v })
    .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: v } })
    .run();
}

function voiceFor(projectId: string, characterId: string | null): { modelId: string; voiceId: string; pitch?: number; speed?: number } {
  if (!characterId) return getNarratorVoice(projectId);
  const c = getDb().select().from(schema.characters).where(eq(schema.characters.id, characterId)).get();
  const modelId = !c || c.voiceProvider === 'auto' || !c.voiceProvider ? defaultTtsModel() : c.voiceProvider;
  const caps = getModel(modelId).caps;
  const voiceId = c?.voiceId && caps.voices?.some((v) => v.id === c.voiceId) ? c.voiceId : caps.voices?.[0]?.id ?? '';
  return { modelId, voiceId, pitch: c?.voiceSettings.pitch, speed: c?.voiceSettings.speed };
}

/** Generate (or regenerate) voice audio for specific lines — never the whole scene unless asked. */
export function requestDialogueAudio(projectId: string, opts: { lineIds?: string[]; regenerate?: boolean } = {}) {
  requireApproved(projectId, 'story');
  const db = getDb();
  let lines = db.select().from(schema.dialogueLines).where(eq(schema.dialogueLines.projectId, projectId)).all();
  if (opts.lineIds) lines = lines.filter((l) => opts.lineIds!.includes(l.id));
  const jobs = [];
  for (const l of lines) {
    if (l.activeAudioId && !opts.regenerate) continue;
    const v = voiceFor(projectId, l.characterId);
    const { job, duplicate } = createJob({
      projectId,
      sceneId: l.sceneId,
      kind: 'tts',
      modelId: v.modelId,
      budgetCategory: 'audio',
      isRevision: !!opts.regenerate,
      variant: opts.regenerate ? Date.now() : undefined,
      input: { lineId: l.id },
      request: {
        kind: 'tts',
        text: l.text,
        voiceId: v.voiceId,
        emotion: l.emotion,
        speed: l.speed * (v.speed ?? 1),
        pitch: v.pitch,
        pronunciation: l.pronunciation,
        width: 0,
        height: 0,
      },
    });
    jobs.push({ lineId: l.id, jobId: job.id, state: job.state, duplicate });
  }
  return jobs;
}

/** Import a result file into the asset store, then attach it to its dialogue line. */
export async function attachTtsResult(lineId: string, jobId: string, provider: string, voiceId: string, output: NormalizedOutput) {
  const db = getDb();
  const line = db.select().from(schema.dialogueLines).where(eq(schema.dialogueLines.id, lineId)).get();
  if (!line) throw new Error('Dialogue line no longer exists');
  const project = requireProject(line.projectId);
  const f = output.files[0];
  const asset = await importAsset({
    sourcePath: f.path,
    originalName: `line-${line.id}${f.ext}`,
    category: 'dialogue',
    projectId: line.projectId,
    provenance: { source: output.mock ? 'mock' : provider === 'local' ? 'local' : 'provider', provider, jobId, note: output.mock ? 'MOCK voice placeholder' : undefined },
    move: true,
  });
  return createSegment(line, asset.id, provider, voiceId, project.fps);
}

async function createSegment(line: typeof schema.dialogueLines.$inferSelect, assetId: string, provider: string, voiceId: string, fps: number) {
  const db = getDb();
  const abs = assetAbsPath(assetId);
  const p = await probe(abs);
  const cues = await mouthCuesForFile(abs, fps);
  const prev = db.select().from(schema.audioSegments).where(eq(schema.audioSegments.dialogueLineId, line.id)).orderBy(desc(schema.audioSegments.version)).get();
  const id = newId('aud');
  const voice = provider === 'import' ? 'import' : voiceId;
  db.insert(schema.audioSegments)
    .values({ id, dialogueLineId: line.id, assetId, provider, voiceId: voice, durationSec: p.durationSec, mouthCues: cues, cueFps: fps, textHash: lineTextHash(line, voice), version: (prev?.version ?? 0) + 1 })
    .run();
  // Activate unless the line text changed while the job was running.
  const current = db.select().from(schema.dialogueLines).where(eq(schema.dialogueLines.id, line.id)).get()!;
  if (current.text === line.text) db.update(schema.dialogueLines).set({ activeAudioId: id }).where(eq(schema.dialogueLines.id, line.id)).run();
  return id;
}

/** Replace one line with an imported recording (no regeneration of anything else). */
export async function importLineRecording(lineId: string, assetId: string) {
  const db = getDb();
  const line = db.select().from(schema.dialogueLines).where(eq(schema.dialogueLines.id, lineId)).get();
  if (!line) throw new Error('Line not found');
  const a = getAsset(assetId);
  if (!a || a.kind !== 'audio') throw new Error('Recording must be an audio asset');
  return createSegment(line, assetId, 'import', 'import', requireProject(line.projectId).fps);
}

export function useAudioSegment(lineId: string, segmentId: string) {
  const seg = getDb().select().from(schema.audioSegments).where(and(eq(schema.audioSegments.id, segmentId), eq(schema.audioSegments.dialogueLineId, lineId))).get();
  if (!seg) throw new Error('Segment not found for this line');
  getDb().update(schema.dialogueLines).set({ activeAudioId: segmentId }).where(eq(schema.dialogueLines.id, lineId)).run();
}

export function listDialogueAudio(projectId: string) {
  const db = getDb();
  const scenes = db.select().from(schema.scenes).where(eq(schema.scenes.projectId, projectId)).orderBy(asc(schema.scenes.seq)).all();
  const lines = db.select().from(schema.dialogueLines).where(eq(schema.dialogueLines.projectId, projectId)).orderBy(asc(schema.dialogueLines.seq)).all();
  const segs = lines.length ? db.select().from(schema.audioSegments).where(inArray(schema.audioSegments.dialogueLineId, lines.map((l) => l.id))).orderBy(desc(schema.audioSegments.version)).all() : [];
  return scenes.map((s) => ({
    scene: s,
    lines: lines
      .filter((l) => l.sceneId === s.id)
      .map((l) => ({ ...l, segments: segs.filter((g) => g.dialogueLineId === l.id), active: segs.find((g) => g.id === l.activeAudioId) ?? null })),
  }));
}

export function activeSegments(lineIds: string[]) {
  if (!lineIds.length) return new Map<string, typeof schema.audioSegments.$inferSelect>();
  const db = getDb();
  const lines = db.select().from(schema.dialogueLines).where(inArray(schema.dialogueLines.id, lineIds)).all();
  const segIds = lines.map((l) => l.activeAudioId).filter(Boolean) as string[];
  const segs = segIds.length ? db.select().from(schema.audioSegments).where(inArray(schema.audioSegments.id, segIds)).all() : [];
  return new Map(lines.filter((l) => l.activeAudioId).map((l) => [l.id, segs.find((s) => s.id === l.activeAudioId)!]));
}
