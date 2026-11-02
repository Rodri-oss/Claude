/**
 * MOCK provider — zero cost, deterministic, offline. Simulates realistic async job behaviour (queue → run → result),
 * persisted on disk so jobs survive restarts, plus deterministic failure scenarios for testing.
 * Output is clearly watermarked "MOCK" — it is never real AI generation.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { dataDir } from '../config';
import { tmpFile } from '../assets/storage';
import { ffmpeg } from '../media/ffmpeg';
import { babble, writeWav, SR } from '../audio/synth';
import { renderKeyframe, type KeyframeSpec } from '../animation/keyframe';
import { estimateLineSec } from '../story/draft';
import { ProviderError, type CostEstimate, type GenerationRequest, type ModelCapabilities, type NormalizedOutput, type ProviderAdapter, type StatusResult } from './types';

const SIM = 'SIMULATED price for testing the budget flow — not a real provider rate';

const MODELS: ModelCapabilities[] = [
  {
    id: 'mock/image',
    provider: 'mock',
    model: 'image',
    label: 'Mock image (keyframe compositor)',
    kind: 'image',
    modes: ['text-to-image', 'reference-image'],
    resolutions: ['1920x1080', '1080x1920', '960x540'],
    aspectRatios: ['16:9', '9:16'],
    maxReferenceImages: 8,
    audio: false,
    lipSync: false,
    startEndFrames: false,
    negativePrompt: true,
    paid: false,
    verified: true,
    pricing: { unit: 'per_image', usd: 0.04, source: SIM, simulated: true },
    notes: 'Composites approved character + environment assets into a still. Deterministic. Watermarked MOCK.',
  },
  {
    id: 'mock/image-to-video',
    provider: 'mock',
    model: 'image-to-video',
    label: 'Mock image-to-video (FFmpeg motion)',
    kind: 'video',
    modes: ['image-to-video'],
    durationSec: { min: 2, max: 10 },
    resolutions: ['960x540 (draft)', '1920x1080 (final)'],
    aspectRatios: ['16:9', '9:16'],
    maxReferenceImages: 0,
    audio: false,
    lipSync: false,
    startEndFrames: false,
    negativePrompt: true,
    paid: false,
    verified: true,
    pricing: { unit: 'per_second', usd: 0.05, source: SIM + ' (draft $0.05/s, final $0.12/s)', simulated: true },
    notes: 'Animates the approved start image with a camera drift. NOT AI motion. Watermarked MOCK AI VIDEO.',
  },
  {
    id: 'mock/tts',
    provider: 'mock',
    model: 'tts',
    label: 'Mock voice (synthetic babble)',
    kind: 'tts',
    modes: ['tts'],
    resolutions: [],
    aspectRatios: [],
    maxReferenceImages: 0,
    audio: true,
    lipSync: false,
    startEndFrames: false,
    negativePrompt: false,
    paid: false,
    verified: true,
    pricing: { unit: 'free', usd: 0, source: 'free', simulated: true },
    notes: 'Syllabic tone bursts timed like speech. Placeholder only — not intelligible speech.',
    voices: [
      { id: 'mock-low', label: 'Mock low' },
      { id: 'mock-mid', label: 'Mock mid' },
      { id: 'mock-high', label: 'Mock high' },
    ],
  },
];

interface MockJob {
  id: string;
  req: GenerationRequest;
  createdAt: number;
  latencyMs: number;
  scenario: string;
  resultCalls: number;
}

function stateDir() {
  const d = path.join(dataDir(), 'mock-provider');
  fs.mkdirSync(path.join(d, 'jobs'), { recursive: true });
  fs.mkdirSync(path.join(d, 'keys'), { recursive: true });
  return d;
}
const keyFile = (k: string) => path.join(stateDir(), 'keys', crypto.createHash('sha1').update(k).digest('hex') + '.json');
const jobFile = (id: string) => path.join(stateDir(), 'jobs', id.replace(/[^a-z0-9_-]/gi, '') + '.json');
const readJson = <T>(f: string): T | null => (fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as T) : null);
const writeJson = (f: string, v: unknown) => fs.writeFileSync(f, JSON.stringify(v));

function scenarioOf(req: GenerationRequest) {
  return req.mockScenario || req.prompt?.match(/\[mock:([a-z-]+)\]/)?.[1] || 'success';
}

let fontFile: string | null | undefined;
function font() {
  if (fontFile !== undefined) return fontFile;
  try {
    fontFile = execFileSync('fc-match', ['-f', '%{file}', 'DejaVu Sans:bold'], { encoding: 'utf8' }).trim() || null;
  } catch {
    fontFile = null;
  }
  return fontFile;
}

const hashNum = (s: string) => parseInt(crypto.createHash('md5').update(s).digest('hex').slice(0, 8), 16);

export const mockProvider: ProviderAdapter = {
  id: 'mock',
  label: 'Mock provider (offline, $0)',
  paid: false,
  availability: 'implemented',
  models: () => MODELS,
  isConfigured: () => ({ ok: true }),

  estimateCost(req): CostEstimate {
    if (req.kind === 'image') return { usd: 0.04, breakdown: '1 image × $0.04 (simulated)', simulated: true };
    if (req.kind === 'video') {
      const d = Math.max(2, Math.min(10, Math.ceil(req.durationSec ?? 5)));
      const rate = req.quality === 'final' ? 0.12 : 0.05;
      return { usd: Math.round(d * rate * 100) / 100, breakdown: `${d}s × $${rate}/s ${req.quality ?? 'draft'} (simulated)`, simulated: true };
    }
    return { usd: 0, breakdown: 'mock voice: free', simulated: true };
  },

  async submit(req) {
    const scenario = scenarioOf(req);
    const kf = keyFile(req.idempotencyKey);
    const keyState = readJson<{ attempts: number; jobId?: string }>(kf) ?? { attempts: 0 };
    keyState.attempts++;
    // Idempotency: the same key never creates a second job.
    if (keyState.jobId && fs.existsSync(jobFile(keyState.jobId))) {
      writeJson(kf, keyState);
      return { providerJobId: keyState.jobId };
    }
    if (scenario === 'fail-invalid') throw new ProviderError('Mock: invalid input dimensions', 'invalid_input', 'no');
    // Transient scenarios fail only the FIRST submission of a job (keys are "<jobKey>:<attempt>").
    const jobKeyFile = keyFile(`job:${req.idempotencyKey.replace(/:\d+$/, '')}`);
    const jobState = readJson<{ attempts: number }>(jobKeyFile) ?? { attempts: 0 };
    jobState.attempts++;
    writeJson(jobKeyFile, jobState);
    if (scenario === 'fail-transient' && jobState.attempts === 1) {
      writeJson(kf, keyState);
      throw new ProviderError('Mock: 503 service unavailable (request rejected before acceptance)', 'transient', 'no', 50);
    }
    if (scenario === 'fail-ratelimit' && jobState.attempts === 1) {
      writeJson(kf, keyState);
      throw new ProviderError('Mock: 429 rate limited', 'rate_limited', 'no', 50);
    }
    const id = `mock_${crypto.randomBytes(6).toString('hex')}`;
    const latency = scenario === 'slow' ? 8000 : Number(process.env.SCENEFORGE_MOCK_LATENCY_MS ?? 1200);
    writeJson(jobFile(id), { id, req, createdAt: Date.now(), latencyMs: latency, scenario, resultCalls: 0 } satisfies MockJob);
    keyState.jobId = id;
    writeJson(kf, keyState);
    if (scenario === 'fail-ambiguous' && keyState.attempts === 1) {
      // The provider accepted the job, but our connection dropped before we saw the id.
      throw new ProviderError('Mock: connection reset after request was sent', 'ambiguous', 'unknown');
    }
    return { providerJobId: id };
  },

  async status(providerJobId): Promise<StatusResult> {
    const job = readJson<MockJob>(jobFile(providerJobId));
    if (!job) return { status: 'failed', error: new ProviderError('Mock: unknown job id', 'provider_failed', 'no') };
    const elapsed = Date.now() - job.createdAt;
    if (job.scenario === 'fail-render' && elapsed >= job.latencyMs) return { status: 'failed', error: new ProviderError('Mock: generation failed on provider', 'provider_failed', 'no') };
    if (elapsed < job.latencyMs * 0.2) return { status: 'queued', progress: 0 };
    if (elapsed < job.latencyMs) return { status: 'running', progress: elapsed / job.latencyMs };
    return { status: 'succeeded', progress: 1 };
  },

  async result(providerJobId): Promise<NormalizedOutput> {
    const f = jobFile(providerJobId);
    const job = readJson<MockJob>(f);
    if (!job) throw new ProviderError('Mock: unknown job id', 'provider_failed', 'no');
    job.resultCalls++;
    writeJson(f, job);
    if (job.scenario === 'expired-media' && job.resultCalls === 1) throw new ProviderError('Mock: result URL expired', 'expired_media', 'yes');
    const req = job.req;
    const est = mockProvider.estimateCost(req);
    const seed = req.seed ?? hashNum(req.idempotencyKey);
    if (req.kind === 'image') {
      const out = tmpFile('.png');
      if (req.keyframe) {
        await renderKeyframe({ ...(req.keyframe as KeyframeSpec), badge: 'MOCK IMAGE', badgeCorner: 'bottom-right' }, out);
      } else {
        const hue = seed % 360;
        await sharp({
          create: { width: req.width, height: req.height, channels: 4, background: `hsl(${hue},45%,35%)` },
        })
          .composite([
            {
              input: Buffer.from(
                `<svg width="${req.width}" height="${req.height}"><text x="50%" y="50%" text-anchor="middle" font-size="${Math.round(req.height / 20)}" font-family="DejaVu Sans" fill="#fff">MOCK IMAGE: ${(req.prompt ?? '').replace(/[<>&]/g, '').slice(0, 60)}</text></svg>`,
              ),
            },
          ])
          .png()
          .toFile(out);
      }
      return { files: [{ path: out, kind: 'image', ext: '.png' }], actualCostUsd: est.usd, costSource: 'provider', mock: true, meta: { seed } };
    }
    if (req.kind === 'video') {
      if (!req.imagePath || !fs.existsSync(req.imagePath)) throw new ProviderError('Mock: start image missing', 'invalid_input', 'no');
      const draft = req.quality !== 'final';
      const W = draft ? Math.round(req.width / 2) : req.width;
      const H = draft ? Math.round(req.height / 2) : req.height;
      const fps = 24;
      const dur = Math.max(2, Math.min(10, req.durationSec ?? 5));
      const frames = Math.round(dur * fps);
      const out = tmpFile('.mp4');
      const dir = seed % 2 ? 1 : -1;
      const ff = font();
      const label = ff
        ? `,drawtext=fontfile=${ff}:text='MOCK AI VIDEO':x=w-tw-w*0.03:y=h*0.04:fontsize=h*0.04:fontcolor=0xffcc33:box=1:boxcolor=black@0.5:boxborderw=8`
        : '';
      const vf =
        `scale=${W * 2}:${H * 2},` +
        `zoompan=z='1+0.0018*on':x='iw/2-(iw/zoom/2)+${dir}*on*${(W * 0.0009).toFixed(3)}':y='ih/2-(ih/zoom/2)+sin(on/9)*${(H * 0.006).toFixed(2)}':d=1:s=${W}x${H}:fps=${fps},` +
        `eq=brightness='0.02*sin(n/7)'${label},format=yuv420p`;
      await ffmpeg(['-loop', '1', '-framerate', String(fps), '-t', String(dur), '-i', req.imagePath, '-vf', vf, '-frames:v', String(frames), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-r', String(fps), out]);
      return { files: [{ path: out, kind: 'video', ext: '.mp4' }], actualCostUsd: est.usd, costSource: 'provider', mock: true, meta: { seed, width: W, height: H, durationSec: dur } };
    }
    // TTS
    const text = applyPronunciation(req.text ?? '', req.pronunciation);
    const pitch = req.voiceId === 'mock-low' ? 120 : req.voiceId === 'mock-high' ? 260 : 185;
    const wps = (estimateLineSec(text, req.emotion ?? 'neutral', req.speed ?? 1) > 0 ? text.split(/\s+/).length / estimateLineSec(text, req.emotion ?? 'neutral', req.speed ?? 1) : 2.6) * 1.05;
    const out = tmpFile('.wav');
    writeWav(out, [babble(text, { pitchHz: pitch * (req.pitch ?? 1), wps, seed })], SR);
    return { files: [{ path: out, kind: 'audio', ext: '.wav' }], actualCostUsd: 0, costSource: 'free', mock: true, meta: { voice: req.voiceId } };
  },

  async reconcile(idempotencyKey) {
    const s = readJson<{ attempts: number; jobId?: string }>(keyFile(idempotencyKey));
    if (s?.jobId && fs.existsSync(jobFile(s.jobId))) return { found: true, providerJobId: s.jobId };
    return { found: false };
  },

  classifyError(e) {
    if (e instanceof ProviderError) return e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/ENOSPC/.test(msg)) return new ProviderError(msg, 'disk_space', 'no');
    return new ProviderError(msg, 'unknown', 'unknown');
  },
};

export function applyPronunciation(text: string, map?: Record<string, string>) {
  if (!map) return text;
  let t = text;
  for (const [word, say] of Object.entries(map)) {
    if (!word) continue;
    t = t.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), say);
  }
  return t;
}
