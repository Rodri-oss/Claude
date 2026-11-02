/** Render a half-resolution preview of one scene of the demo project (for quick inspection). */
import { loadEnvFiles } from '../lib/config';
loadEnvFiles();
const { getDb, schema } = await import('../lib/db');
const { eq, desc } = await import('drizzle-orm');
const { requestExport, getExport } = await import('../lib/rendering/export');
const { registerHandlers } = await import('../lib/jobs/handlers');
const { processOne, getJob } = await import('../lib/jobs/queue');
const { getStory } = await import('../lib/story/service');
registerHandlers();
const p = getDb().select().from(schema.projects).where(eq(schema.projects.title, 'The Lantern Courier')).orderBy(desc(schema.projects.createdAt)).get()!;
const idx = Number(process.argv[2] ?? 1);
const scene = getStory(p.id).scenes[idx - 1];
const { exportId, jobId } = requestExport(p.id, 'preview', { sceneId: scene.id, scale: 0.5 });
const t = Date.now();
while (await processOne('preview', 'render')) {}
const e = getExport(exportId)!;
console.log(getJob(jobId)!.state, getJob(jobId)!.error ?? '', `${((Date.now() - t) / 1000).toFixed(0)}s`, e.videoPath, e.durationSec, JSON.stringify((e.validation as any)?.reasons));
