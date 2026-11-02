import fs from 'node:fs';
import path from 'node:path';
import { eq, desc, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { newId, nowIso } from '../ids';
import { paths } from '../config';
import { requireApproved, checkpointStatus } from '../approvals/service';
import { requireProject } from '../story/service';
import { saveTimeline, getTimeline, latestTimeline } from '../timeline/builder';
import { createJob, type Job, type JobContext } from '../jobs/queue';
import { assertDiskSpace, tmpFile, toDataRel, writeAtomic, finalizeAtomic } from '../assets/storage';
import { ffmpeg, probe, verifyDecodable } from '../media/ffmpeg';
import { renderVideo, mixAudio, mux, toSrt, audioPeakDb } from './render';
import type { Timeline } from '../types';

export const RUNTIME_RANGE = { min: 120, max: 300 };

export function requestExport(projectId: string, kind: 'final' | 'preview', opts: { sceneId?: string; scale?: number } = {}) {
  const project = requireProject(projectId);
  let timelineId: string;
  if (kind === 'final') {
    requireApproved(projectId, 'final');
    const tl = latestTimeline(projectId);
    if (!tl) throw new Error('No timeline');
    timelineId = tl.id;
  } else {
    timelineId = saveTimeline(projectId).id;
  }
  const exportId = newId('exp');
  const { job, duplicate } = createJob({
    projectId,
    kind: kind === 'final' ? 'export' : 'render_preview',
    input: { exportId, timelineId, kind, sceneId: opts.sceneId ?? null, scale: kind === 'final' ? 1 : opts.scale ?? 0.5 },
    variant: exportId,
  });
  if (!duplicate) {
    getDb().insert(schema.exportsTable).values({ id: exportId, projectId, kind, status: 'queued', jobId: job.id, timelineId, sceneFiles: [], width: project.width, height: project.height, fps: project.fps }).run();
  }
  return { exportId, jobId: job.id };
}

export function listExports(projectId: string) {
  return getDb().select().from(schema.exportsTable).where(eq(schema.exportsTable.projectId, projectId)).orderBy(desc(schema.exportsTable.createdAt)).all();
}

export function getExport(id: string) {
  return getDb().select().from(schema.exportsTable).where(eq(schema.exportsTable.id, id)).get();
}

interface ExportInput {
  exportId: string;
  timelineId: string;
  kind: 'final' | 'preview';
  sceneId: string | null;
  scale: number;
}

export async function runExport(job: Job, ctx: JobContext) {
  const input = job.input as unknown as ExportInput;
  const tlRow = getTimeline(input.timelineId);
  if (!tlRow) throw new Error('Timeline version not found');
  const timeline = tlRow.data as Timeline;
  const project = requireProject(timeline.projectId);
  const db = getDb();
  const setExport = (patch: Partial<typeof schema.exportsTable.$inferInsert>) => db.update(schema.exportsTable).set(patch).where(eq(schema.exportsTable.id, input.exportId)).run();
  setExport({ status: 'rendering' });

  // final exports must still match the approved timeline at render time
  if (input.kind === 'final') {
    const st = checkpointStatus(project.id, 'final');
    if (st.state !== 'approved' || st.approval?.snapshotHash !== tlRow.hash) throw Object.assign(new Error('Final review approval does not match this timeline version'), { errorClass: 'approval' });
  }

  let range: [number, number] = [0, timeline.durationInFrames - 1];
  if (input.sceneId) {
    const sr = timeline.scenes.find((s) => s.sceneId === input.sceneId);
    if (!sr) throw new Error('Scene not in timeline');
    range = [sr.startFrame, sr.endFrame - 1];
  }
  const frames = range[1] - range[0] + 1;
  const durationSec = frames / timeline.fps;
  assertDiskSpace(Math.max(300e6, durationSec * 3e6));

  const vTmp = tmpFile('.mp4');
  const aTmp = tmpFile('.wav');
  const outTmp = tmpFile('.mp4');
  const t0 = Date.now();
  try {
    ctx.progress(0.01, 'Bundling composition');
    await renderVideo({
      timeline,
      outPath: vTmp,
      scale: input.scale,
      frameRange: input.sceneId ? range : undefined,
      onProgress: (p) => ctx.progress(0.02 + p * 0.78, `Rendering frames ${Math.round(p * 100)}%`),
    });
    ctx.progress(0.82, 'Mixing audio');
    const mixInfo = await mixAudio(timeline, aTmp, range);
    const peak = await audioPeakDb(aTmp);
    ctx.progress(0.88, 'Muxing');
    await mux(vTmp, aTmp, outTmp, durationSec);

    ctx.progress(0.9, 'Validating');
    const pr = await probe(outTmp);
    const dec = await verifyDecodable(outTmp);
    const expectW = Math.round(timeline.width * input.scale);
    const expectH = Math.round(timeline.height * input.scale);
    const reasons: string[] = [];
    if (!pr.video || pr.video.codec !== 'h264') reasons.push(`video codec ${pr.video?.codec} != h264`);
    if (!pr.audio || pr.audio.codec !== 'aac') reasons.push(`audio codec ${pr.audio?.codec} != aac`);
    if (pr.video && (Math.abs(pr.video.width - expectW) > 2 || Math.abs(pr.video.height - expectH) > 2)) reasons.push(`resolution ${pr.video.width}x${pr.video.height} != ${expectW}x${expectH}`);
    if (pr.video && Math.abs(pr.video.fps - timeline.fps) > 0.01) reasons.push(`fps ${pr.video.fps} != ${timeline.fps}`);
    if (Math.abs(pr.durationSec - durationSec) > 2 / timeline.fps + 0.05) reasons.push(`duration ${pr.durationSec.toFixed(3)}s != timeline ${durationSec.toFixed(3)}s`);
    if (!dec.ok) reasons.push(`decode errors: ${dec.errors.slice(0, 200)}`);
    if (peak.maxDb > -0.1) reasons.push(`audio clipping risk (peak ${peak.maxDb} dBFS)`);
    const runtimeOk = input.sceneId || input.kind === 'preview' ? true : pr.durationSec >= RUNTIME_RANGE.min && pr.durationSec <= RUNTIME_RANGE.max;
    if (!runtimeOk) reasons.push(`runtime ${pr.durationSec.toFixed(1)}s outside ${RUNTIME_RANGE.min}–${RUNTIME_RANGE.max}s`);
    const targetDeviation = (pr.durationSec - project.targetDurationSec) / project.targetDurationSec;
    const validation = {
      ok: reasons.length === 0,
      reasons,
      probe: pr,
      decodable: dec.ok,
      audioPeakDb: peak.maxDb,
      audioMeanDb: peak.meanDb,
      runtimeInRange: runtimeOk,
      targetDurationSec: project.targetDurationSec,
      targetDeviationPct: Math.round(targetDeviation * 1000) / 10,
      renderSeconds: Math.round((Date.now() - t0) / 1000),
      audioClips: mixInfo.clips,
    };

    // Finalize atomically
    const dir = path.join(paths.exports(), project.id, input.exportId);
    fs.mkdirSync(dir, { recursive: true });
    const base = input.sceneId ? `scene-${timeline.scenes.find((s) => s.sceneId === input.sceneId)!.index}` : input.kind === 'final' ? 'final' : 'preview';
    const videoAbs = path.join(dir, `${base}.mp4`);
    finalizeAtomic(outTmp, videoAbs);
    const srtAbs = path.join(dir, `${base}.srt`);
    writeAtomic(srtAbs, toSrt(timeline, range[0], range));

    // Individual scene files (cut from the validated master — re-encoded for frame accuracy)
    const sceneFiles: string[] = [];
    if (input.kind === 'final' && !input.sceneId) {
      for (const [i, s] of timeline.scenes.entries()) {
        ctx.progress(0.92 + (0.06 * i) / timeline.scenes.length, `Cutting scene ${s.index}`);
        const tmp = tmpFile('.mp4');
        await ffmpeg(['-ss', (s.startFrame / timeline.fps).toFixed(4), '-i', videoAbs, '-t', ((s.endFrame - s.startFrame) / timeline.fps).toFixed(4), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', tmp]);
        const dest = path.join(dir, `scene-${String(s.index).padStart(2, '0')}.mp4`);
        finalizeAtomic(tmp, dest);
        sceneFiles.push(toDataRel(dest));
      }
    }

    const manifestAbs = path.join(dir, 'manifest.json');
    writeAtomic(manifestAbs, JSON.stringify(buildManifest(project, timeline, tlRow, input, validation, sceneFiles, toDataRel(videoAbs)), null, 2));
    const stat = fs.statSync(videoAbs);
    setExport({
      status: validation.ok ? 'completed' : 'completed_with_warnings',
      dir: toDataRel(dir),
      videoPath: toDataRel(videoAbs),
      srtPath: toDataRel(srtAbs),
      manifestPath: toDataRel(manifestAbs),
      sceneFiles,
      width: pr.video?.width ?? null,
      height: pr.video?.height ?? null,
      fps: timeline.fps,
      durationSec: pr.durationSec,
      sizeBytes: stat.size,
      validation,
    });
    return { exportId: input.exportId, video: toDataRel(videoAbs), validation: { ok: validation.ok, reasons } };
  } catch (e) {
    setExport({ status: 'failed', validation: { ok: false, reasons: [(e as Error).message] } });
    throw e;
  } finally {
    for (const f of [vTmp, aTmp, outTmp]) fs.rmSync(f, { force: true });
  }
}

function buildManifest(project: ReturnType<typeof requireProject>, timeline: Timeline, tlRow: { id: string; version: number; hash: string }, input: ExportInput, validation: Record<string, unknown>, sceneFiles: string[], video: string) {
  const db = getDb();
  const shotIds = timeline.clips.map((c) => c.shotId);
  const shots = shotIds.length ? db.select().from(schema.shots).where(inArray(schema.shots.id, shotIds)).all() : [];
  const versions = shotIds.length ? db.select().from(schema.shotVersions).where(inArray(schema.shotVersions.shotId, shotIds)).all() : [];
  const paths = new Set<string>();
  for (const c of timeline.clips) {
    c.background.forEach((b) => paths.add(b.src));
    c.characters.forEach((ch) => [ch.body, ch.face, ch.eyesClosed, ...(ch.mouths ?? [])].forEach((p) => p && paths.add(p)));
    if (c.video) paths.add(c.video.src);
    if (c.still) paths.add(c.still.src);
  }
  timeline.audio.forEach((a) => paths.add(a.src));
  const assets = paths.size ? db.select().from(schema.assets).where(inArray(schema.assets.path, [...paths])).all() : [];
  return {
    generator: 'SceneForge AI',
    generatedAt: nowIso(),
    project: { id: project.id, title: project.title, genre: project.genre, aspect: project.aspect, targetDurationSec: project.targetDurationSec },
    export: { id: input.exportId, kind: input.kind, scene: input.sceneId, scale: input.scale, video, sceneFiles, codec: 'H.264 / AAC', fps: timeline.fps },
    timeline: { id: tlRow.id, version: tlRow.version, hash: tlRow.hash, durationInFrames: timeline.durationInFrames, durationSec: timeline.durationInFrames / timeline.fps, scenes: timeline.scenes },
    containsMockContent: assets.some((a) => a.provenance.source === 'mock'),
    shots: timeline.clips.map((c) => {
      const s = shots.find((x) => x.id === c.shotId);
      const v = versions.find((x) => x.id === s?.activeVersionId);
      return { shotId: c.shotId, label: c.label, mode: c.mode, plannedMode: s?.mode, startFrame: c.startFrame, durationInFrames: c.durationInFrames, transition: c.transitionIn, activeVersion: v ? { id: v.id, version: v.version, source: v.source, status: v.status } : null, badge: c.badge };
    }),
    assets: assets.map((a) => ({ id: a.id, path: a.path, kind: a.kind, category: a.category, sha256: a.sha256, version: a.version, provenance: a.provenance })),
    validation,
  };
}
