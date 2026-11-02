import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Every test file runs in its own process with its own throwaway data directory + database.
process.env.SCENEFORGE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sceneforge-test-'));
process.env.SCENEFORGE_MOCK_LATENCY_MS = '30';
process.env.SCENEFORGE_POLL_MS = '20';
process.env.SCENEFORGE_ALLOW_PAID_PROVIDERS = 'false';
