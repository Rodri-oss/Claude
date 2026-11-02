import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mockProvider } from '@/lib/providers/mock';
import { localEspeakProvider } from '@/lib/providers/local-espeak';
import { getProvider, listProviders, getModel } from '@/lib/providers/registry';
import { ProviderError } from '@/lib/providers/types';
import { probe } from '@/lib/media/ffmpeg';
import { bins } from '@/lib/config';
import { png } from './fixtures';
import { assetAbsPath } from '@/lib/assets/service';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function runToResult(req: Parameters<typeof mockProvider.submit>[0]) {
  const { providerJobId } = await mockProvider.submit(req);
  for (let i = 0; i < 100; i++) {
    const s = await mockProvider.status(providerJobId);
    if (s.status === 'succeeded') return mockProvider.result(providerJobId);
    if (s.status === 'failed') throw s.error;
    await wait(20);
  }
  throw new Error('timeout');
}

describe('provider adapters', () => {
  it('normalizes mock image/video/tts results into NormalizedOutput', async () => {
    const img = await runToResult({ kind: 'image', modelId: 'mock/image', idempotencyKey: 'img-1', prompt: 'a test', width: 320, height: 180 });
    expect(img.files[0].kind).toBe('image');
    expect(fs.existsSync(img.files[0].path)).toBe(true);
    expect(img.mock).toBe(true);
    expect(img.costSource).toBe('provider');
    expect(img.actualCostUsd).toBe(0.04);

    const start = await png(320, 180, '#246', 'start.png', 'still');
    const vid = await runToResult({ kind: 'video', modelId: 'mock/image-to-video', idempotencyKey: 'vid-1', imagePath: assetAbsPath(start), width: 320, height: 180, durationSec: 3, quality: 'final' });
    const pr = await probe(vid.files[0].path);
    expect(pr.video?.codec).toBe('h264');
    expect(pr.durationSec).toBeCloseTo(3, 1);
    expect(vid.actualCostUsd).toBeCloseTo(0.36, 5);

    const tts = await runToResult({ kind: 'tts', modelId: 'mock/tts', idempotencyKey: 'tts-1', text: 'Hello world, this is a test.', voiceId: 'mock-low', width: 0, height: 0 });
    expect(tts.files[0].kind).toBe('audio');
    expect((await probe(tts.files[0].path)).audio?.codec).toBe('pcm_s16le');
  });

  it('is idempotent per key and reconciles ambiguous submissions', async () => {
    const req = { kind: 'image' as const, modelId: 'mock/image', idempotencyKey: 'amb-1', width: 64, height: 64, mockScenario: 'fail-ambiguous' };
    await expect(mockProvider.submit(req)).rejects.toMatchObject({ errorClass: 'ambiguous', billed: 'unknown' });
    const r = await mockProvider.reconcile!('amb-1');
    expect(r.found).toBe(true);
    const again = await mockProvider.submit(req);
    expect(again.providerJobId).toBe(r.providerJobId);
  });

  it('classifies errors and only treats unbilled transient errors as retryable', () => {
    expect(new ProviderError('x', 'transient', 'no').retryable).toBe(true);
    expect(new ProviderError('x', 'transient', 'unknown').retryable).toBe(false);
    expect(new ProviderError('x', 'ambiguous', 'unknown').retryable).toBe(false);
    expect(mockProvider.classifyError(new Error('ENOSPC: no space')).errorClass).toBe('disk_space');
  });

  it('registers Phase 2 providers as planned placeholders that refuse to run', async () => {
    const planned = listProviders().filter((p) => p.availability === 'planned').map((p) => p.id);
    expect(planned).toEqual(['fal', 'elevenlabs', 'runway']);
    await expect(getProvider('fal').submit({} as never)).rejects.toMatchObject({ errorClass: 'not_configured' });
    expect(() => getModel('fal/anything')).toThrow();
  });

  it.runIf(!!bins.espeak())('local eSpeak NG produces real speech audio', async () => {
    const { providerJobId } = await localEspeakProvider.submit({ kind: 'tts', modelId: 'local/espeak-ng', idempotencyKey: 'es-1', text: 'Testing one two three.', voiceId: 'en-us+f2', emotion: 'happy', width: 0, height: 0 });
    const out = await localEspeakProvider.result(providerJobId);
    const pr = await probe(out.files[0].path);
    expect(pr.durationSec).toBeGreaterThan(0.8);
    expect(out.mock).toBe(false);
    expect(out.actualCostUsd).toBe(0);
  });
});
