/** Build the demo library + "The Lantern Courier" demo project through all checkpoints except final review. */
import { loadEnvFiles } from '../lib/config';
loadEnvFiles();
process.env.SCENEFORGE_MOCK_LATENCY_MS ??= '300';
process.env.SCENEFORGE_POLL_MS ??= '200';
const { createDemoProject } = await import('../lib/demo/seed');
const t = Date.now();
const r = await createDemoProject((m) => console.log(`[demo] ${m}`));
console.log(`[demo] done in ${((Date.now() - t) / 1000).toFixed(1)}s`, r);
