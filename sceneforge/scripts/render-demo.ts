/** Final review + export of the demo project (renders the full 1080p MP4 in-process). */
import { loadEnvFiles } from '../lib/config';
loadEnvFiles();
const { getDb, schema } = await import('../lib/db');
const { eq, desc } = await import('drizzle-orm');
const { approveCheckpoint } = await import('../lib/approvals/service');
const { saveTimeline } = await import('../lib/timeline/builder');
const { requestExport, getExport } = await import('../lib/rendering/export');
const { registerHandlers } = await import('../lib/jobs/handlers');
const { processOne, getJob } = await import('../lib/jobs/queue');
registerHandlers();
const p = getDb().select().from(schema.projects).where(eq(schema.projects.title, 'The Lantern Courier')).orderBy(desc(schema.projects.createdAt)).get();
if (!p) throw new Error('Run npm run demo:seed first');
saveTimeline(p.id);
approveCheckpoint(p.id, 'final', 'Demo: final review approved');
const { exportId, jobId } = requestExport(p.id, 'final');
console.log(`[render] export ${exportId} job ${jobId}`);
const t = Date.now();
let last = '';
const timer = setInterval(() => {
  const j = getJob(jobId)!;
  if (j.message !== last) console.log(`[render] ${Math.round(j.progress * 100)}% ${j.message}`);
  last = j.message;
}, 5000);
while (await processOne('render-demo', 'render')) {}
clearInterval(timer);
const j = getJob(jobId)!;
const e = getExport(exportId)!;
console.log(`[render] job ${j.state} in ${((Date.now() - t) / 1000).toFixed(0)}s`);
console.log(JSON.stringify({ status: e.status, video: e.videoPath, srt: e.srtPath, manifest: e.manifestPath, scenes: e.sceneFiles, durationSec: e.durationSec, size: e.sizeBytes, validation: { ...(e.validation as object), probe: undefined } }, null, 2));
if (j.state !== 'COMPLETED') process.exit(1);
