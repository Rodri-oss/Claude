/**
 * Local eSpeak NG voice — free, offline, intelligible but robotic. Useful for timing drafts and
 * animatics before paying for ElevenLabs. Only available if espeak-ng is installed.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { bins, dataDir } from '../config';
import { run } from '../media/ffmpeg';
import { tmpFile } from '../assets/storage';
import { applyPronunciation } from './mock';
import { ProviderError, type GenerationRequest, type ModelCapabilities, type NormalizedOutput, type ProviderAdapter } from './types';

const VOICES = [
  { id: 'en-us+m3', label: 'US male (m3)' },
  { id: 'en-us+m7', label: 'US male deep (m7)' },
  { id: 'en-us+f2', label: 'US female (f2)' },
  { id: 'en-us+f4', label: 'US female bright (f4)' },
  { id: 'en-gb+m1', label: 'UK male (m1)' },
  { id: 'en-gb+f3', label: 'UK female (f3)' },
  { id: 'en-us+klatt3', label: 'US narrator (klatt3)' },
];

const EMOTION: Record<string, { speed: number; pitch: number; amp: number }> = {
  neutral: { speed: 1, pitch: 0, amp: 100 },
  calm: { speed: 0.92, pitch: -4, amp: 95 },
  happy: { speed: 1.08, pitch: 10, amp: 110 },
  excited: { speed: 1.15, pitch: 16, amp: 120 },
  determined: { speed: 1.02, pitch: 2, amp: 115 },
  angry: { speed: 1.1, pitch: 4, amp: 140 },
  shouting: { speed: 1.05, pitch: 12, amp: 160 },
  sad: { speed: 0.85, pitch: -10, amp: 85 },
  worried: { speed: 0.97, pitch: 6, amp: 95 },
  surprised: { speed: 1.08, pitch: 18, amp: 115 },
  whisper: { speed: 0.9, pitch: -2, amp: 60 },
};

const MODEL: ModelCapabilities = {
  id: 'local/espeak-ng',
  provider: 'local',
  model: 'espeak-ng',
  label: 'eSpeak NG (local, free, robotic)',
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
  pricing: { unit: 'free', usd: 0, source: 'local open-source TTS', simulated: false },
  notes: 'Emotion is approximated with speed/pitch/amplitude. Pronunciation overrides are applied as text substitution.',
  voices: VOICES,
};

const jobsDir = () => {
  const d = path.join(dataDir(), 'local-provider');
  fs.mkdirSync(d, { recursive: true });
  return d;
};

export const localEspeakProvider: ProviderAdapter = {
  id: 'local',
  label: 'Local tools (free)',
  paid: false,
  availability: 'implemented',
  models: () => (bins.espeak() ? [MODEL] : []),
  isConfigured: () => (bins.espeak() ? { ok: true } : { ok: false, reason: 'espeak-ng not installed' }),
  estimateCost: () => ({ usd: 0, breakdown: 'local: free', simulated: false }),

  async submit(req: GenerationRequest) {
    const bin = bins.espeak();
    if (!bin) throw new ProviderError('espeak-ng not installed', 'not_configured', 'no');
    if (req.kind !== 'tts' || !req.text) throw new ProviderError('local provider only supports TTS', 'unsupported', 'no');
    const id = `local_${crypto.createHash('sha1').update(req.idempotencyKey).digest('hex').slice(0, 16)}`;
    const out = path.join(jobsDir(), `${id}.wav`);
    if (!fs.existsSync(out)) {
      const e = EMOTION[(req.emotion ?? 'neutral').toLowerCase()] ?? EMOTION.neutral;
      const voice = VOICES.some((v) => v.id === req.voiceId) ? req.voiceId! : 'en-us+m3';
      const wpm = Math.round(165 * e.speed * (req.speed ?? 1));
      const pitch = Math.max(0, Math.min(99, 50 + e.pitch + Math.round(((req.pitch ?? 1) - 1) * 40)));
      const text = applyPronunciation(req.text, req.pronunciation);
      const tmp = tmpFile('.wav');
      await run(bin, ['-v', voice, '-s', String(wpm), '-p', String(pitch), '-a', String(e.amp), '-w', tmp, text], { timeoutMs: 60_000 });
      fs.renameSync(tmp, out);
    }
    return { providerJobId: id };
  },
  async status(id) {
    return fs.existsSync(path.join(jobsDir(), `${id}.wav`)) ? { status: 'succeeded', progress: 1 } : { status: 'failed', error: new ProviderError('local output missing', 'provider_failed', 'no') };
  },
  async result(id): Promise<NormalizedOutput> {
    const src = path.join(jobsDir(), `${id}.wav`);
    if (!fs.existsSync(src)) throw new ProviderError('local output missing', 'provider_failed', 'no');
    const out = tmpFile('.wav');
    fs.copyFileSync(src, out);
    return { files: [{ path: out, kind: 'audio', ext: '.wav' }], actualCostUsd: 0, costSource: 'free', mock: false, meta: {} };
  },
  async reconcile(key) {
    const id = `local_${crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)}`;
    return fs.existsSync(path.join(jobsDir(), `${id}.wav`)) ? { found: true, providerJobId: id } : { found: false };
  },
  classifyError: (e) => (e instanceof ProviderError ? e : new ProviderError(e instanceof Error ? e.message : String(e), 'unknown', 'no')),
};
