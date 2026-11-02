/** Registers job-kind handlers with the queue. Import once in any process that processes jobs. */
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { registerLocalHandler, registerResultHandler } from './queue';
import { importAsset } from '../assets/service';
import { addShotVersion, getShot, listShots, renderShotThumbnail } from '../shots/service';
import { attachTtsResult } from '../audio/service';
import { runExport } from '../rendering/export';

let registered = false;

export function registerHandlers() {
  if (registered) return;
  registered = true;

  registerResultHandler('image', async (job, out) => {
    const shot = getShot(job.shotId!);
    const f = out.files[0];
    const asset = await importAsset({
      sourcePath: f.path,
      originalName: `start-${shot.id}${f.ext}`,
      category: 'still',
      projectId: shot.projectId,
      provenance: { source: out.mock ? 'mock' : 'provider', provider: job.provider, model: job.model, prompt: shot.imagePrompt, jobId: job.id },
      move: true,
    });
    const versionId = addShotVersion(shot.id, { kind: shot.mode === 'C' ? 'still' : 'start_image', assetId: asset.id, jobId: job.id, source: out.mock ? 'mock' : 'provider' });
    if (shot.mode === 'C') addShotVersion(shot.id, { kind: 'start_image', assetId: asset.id, jobId: job.id, source: out.mock ? 'mock' : 'provider', note: 'Same image used as still' });
    return { assetId: asset.id, versionId };
  });

  registerResultHandler('video', async (job, out) => {
    const shot = getShot(job.shotId!);
    const f = out.files[0];
    const asset = await importAsset({
      sourcePath: f.path,
      originalName: `clip-${shot.id}${f.ext}`,
      category: 'video',
      projectId: shot.projectId,
      provenance: { source: out.mock ? 'mock' : 'provider', provider: job.provider, model: job.model, prompt: shot.motionPrompt, jobId: job.id },
      move: true,
    });
    const versionId = addShotVersion(shot.id, { kind: 'video', assetId: asset.id, jobId: job.id, source: out.mock ? 'mock' : 'provider' });
    if (job.actualCostUsd !== null || job.estimatedCostUsd) {
      getDb()
        .update(schema.shots)
        .set({ actualCostUsd: shot.actualCostUsd + (out.actualCostUsd ?? job.estimatedCostUsd) })
        .where(eq(schema.shots.id, shot.id))
        .run();
    }
    return { assetId: asset.id, versionId };
  });

  registerResultHandler('tts', async (job, out) => {
    const lineId = (job.input as { lineId: string }).lineId;
    const req = (job.input as { request: { voiceId?: string } }).request;
    const segmentId = await attachTtsResult(lineId, job.id, job.provider, req.voiceId ?? '', out);
    return { segmentId };
  });

  registerLocalHandler('storyboard_frames', async (job, ctx) => {
    const shots = listShots(job.projectId!);
    const only = (job.input as { shotIds?: string[] }).shotIds;
    const list = only ? shots.filter((s) => only.includes(s.id)) : shots;
    for (const [i, s] of list.entries()) {
      await renderShotThumbnail(s.id);
      ctx.progress((i + 1) / list.length, `Storyboard frame ${i + 1}/${list.length}`);
    }
    return { frames: list.length };
  });

  registerLocalHandler('export', (job, ctx) => runExport(job, ctx));
  registerLocalHandler('render_preview', (job, ctx) => runExport(job, ctx));
}
