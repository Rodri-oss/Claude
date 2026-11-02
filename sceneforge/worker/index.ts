/**
 * SceneForge background worker. Processes the durable SQLite job queue in two lanes:
 *   - generation: provider jobs (submit / poll / download) — short steps, never blocked by renders
 *   - render: storyboard frames, previews and exports (long-running)
 * Jobs survive restarts: on startup, locks from dead workers are released and in-flight jobs resume
 * (SUBMITTED-without-provider-id jobs are reconciled with the provider, never blindly resubmitted).
 */
import os from 'node:os';
import { loadEnvFiles } from '../lib/config';

loadEnvFiles();

const { getDb } = await import('../lib/db');
const { registerHandlers } = await import('../lib/jobs/handlers');
const { processOne, recoverDeadWorkerLocks, recoverStaleLocks } = await import('../lib/jobs/queue');
const { environmentReport } = await import('../lib/config');

getDb();
registerHandlers();
const host = os.hostname();
const workerId = `${host}:${process.pid}`;
const released = recoverDeadWorkerLocks(host) + recoverStaleLocks();
console.log(`[worker] ${workerId} started. Released ${released} stale lock(s).`);
console.log('[worker] environment', JSON.stringify(environmentReport()));

let stopping = false;
const idle = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lane(name: 'generation' | 'render') {
  while (!stopping) {
    try {
      const did = await processOne(workerId, name);
      if (!did) await idle(500);
    } catch (e) {
      console.error(`[worker:${name}]`, e);
      await idle(2000);
    }
  }
}

const lanes = [lane('generation'), lane('render')];

async function shutdown(sig: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] ${sig} received — finishing current step…`);
  const t = setTimeout(() => {
    console.log('[worker] forced exit; in-flight jobs will be recovered on next start');
    process.exit(0);
  }, 20_000);
  await Promise.allSettled(lanes);
  clearTimeout(t);
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
