import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Load .env.local / .env for non-Next processes (worker, scripts). Next loads these itself. */
let envLoaded = false;
export function loadEnvFiles(root = process.cwd()) {
  if (envLoaded) return;
  envLoaded = true;
  for (const f of ['.env.local', '.env']) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

export function dataDir(): string {
  const d = path.resolve(process.env.SCENEFORGE_DATA_DIR || path.join(process.cwd(), 'data'));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export const paths = {
  db: () => path.join(dataDir(), 'sceneforge.db'),
  projects: () => path.join(dataDir(), 'projects'),
  shared: () => path.join(dataDir(), 'shared-assets'),
  exports: () => path.join(dataDir(), 'exports'),
  tmp: () => path.join(dataDir(), 'tmp'),
  renderCache: () => path.join(dataDir(), 'cache'),
};

export function allowPaidProviders(): boolean {
  return process.env.SCENEFORGE_ALLOW_PAID_PROVIDERS === 'true';
}

export function maxUploadBytes(): number {
  const mb = Number(process.env.SCENEFORGE_MAX_UPLOAD_MB || 500);
  return Math.max(1, mb) * 1024 * 1024;
}

function which(bin: string): string | null {
  try {
    return execFileSync('bash', ['-lc', `command -v ${bin}`], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

const cache = new Map<string, string | null>();
function cached(key: string, fn: () => string | null) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key)!;
}

export const bins = {
  ffmpeg: () => cached('ffmpeg', () => process.env.FFMPEG_PATH || which('ffmpeg')),
  ffprobe: () => cached('ffprobe', () => process.env.FFPROBE_PATH || which('ffprobe')),
  espeak: () => cached('espeak', () => process.env.ESPEAK_PATH || which('espeak-ng') || which('espeak')),
  /** Browser for Remotion. undefined → Remotion downloads/uses its own chrome-headless-shell. */
  browser: (): string | undefined =>
    cached('browser', () => {
      if (process.env.SCENEFORGE_BROWSER_EXECUTABLE) return process.env.SCENEFORGE_BROWSER_EXECUTABLE;
      const base = '/opt/pw-browsers';
      if (fs.existsSync(base)) {
        for (const d of fs.readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell')).sort().reverse()) {
          const p = path.join(base, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
          if (fs.existsSync(p)) return p;
        }
      }
      return null;
    }) ?? undefined,
};

export function environmentReport() {
  return {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    dataDir: dataDir(),
    ffmpeg: bins.ffmpeg(),
    ffprobe: bins.ffprobe(),
    espeak: bins.espeak(),
    browser: bins.browser() ?? '(Remotion default download)',
    allowPaidProviders: allowPaidProviders(),
    keys: {
      fal: Boolean(process.env.FAL_KEY),
      elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
      runway: Boolean(process.env.RUNWAY_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    },
  };
}
