import { describe, expect, it } from 'vitest';
import { writeWav, babble, music, SR } from '@/lib/audio/synth';
import { tmpFile } from '@/lib/assets/storage';
import { probe } from '@/lib/media/ffmpeg';
import { mouthCuesForFile } from '@/lib/audio/mouth';
import { importAsset } from '@/lib/assets/service';
import { requestDialogueAudio, listDialogueAudio } from '@/lib/audio/service';
import { drain } from '@/lib/jobs/queue';
import { buildTimeline, updateEditorSettings } from '@/lib/timeline/builder';
import { mixAudio } from '@/lib/rendering/render';
import { getDb, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { makeApprovedProject } from './fixtures';

describe('media duration', () => {
  it('probes generated audio durations accurately and derives per-frame mouth cues', async () => {
    const f = tmpFile('.wav');
    const pcm = babble('One two three four five six seven eight.', { seed: 3 });
    writeWav(f, [pcm]);
    const p = await probe(f);
    expect(p.durationSec).toBeCloseTo(pcm.length / SR, 2);
    const cues = await mouthCuesForFile(f, 24);
    expect(Math.abs(cues.length - Math.ceil(p.durationSec * 24))).toBeLessThanOrEqual(1);
    expect(cues).toMatch(/^[012]+$/);
    expect(cues.replace(/0/g, '').length).toBeGreaterThan(cues.length * 0.3);
  });

  it('rejects files whose content does not match their extension', async () => {
    const f = tmpFile('.png');
    (await import('node:fs')).writeFileSync(f, 'not an image');
    await expect(importAsset({ sourcePath: f, originalName: 'fake.png', category: 'character', provenance: { source: 'import' } })).rejects.toThrow(/valid image/);
    await expect(importAsset({ sourcePath: f, originalName: 'x.exe', category: 'character', provenance: { source: 'import' } })).rejects.toThrow(/Unsupported/);
  });
});

describe('audio synchronization', () => {
  it('times shots from actual audio durations and keeps dialogue, subtitles and mouth cues aligned', async () => {
    const pid = await makeApprovedProject();
    requestDialogueAudio(pid);
    await drain('t', 120_000);
    const lines = listDialogueAudio(pid).flatMap((s) => s.lines);
    expect(lines.every((l) => l.active)).toBe(true);
    const tl = buildTimeline(pid);
    const fps = tl.fps;
    for (const l of lines) {
      const clip = tl.audio.find((a) => a.dialogueLineId === l.id)!;
      expect(clip.durationInFrames).toBe(Math.round(l.active!.durationSec * fps));
      const sub = tl.subtitles.find((s) => s.text === l.text)!;
      expect(sub.startFrame).toBe(clip.startFrame);
      expect(sub.endFrame).toBe(clip.startFrame + clip.durationInFrames);
      const shotClip = tl.clips.find((c) => clip.startFrame >= c.startFrame && clip.startFrame + clip.durationInFrames <= c.startFrame + c.durationInFrames);
      expect(shotClip, 'dialogue must fit inside its shot').toBeTruthy();
      const speaker = shotClip!.characters.find((c) => c.name === l.speakerName);
      if (speaker) {
        const rel = clip.startFrame - shotClip!.startFrame;
        expect(speaker.mouthCues.slice(0, rel)).toMatch(/^0*$/);
        expect(speaker.mouthCues.slice(rel, rel + clip.durationInFrames)).toBe(l.active!.mouthCues.slice(0, clip.durationInFrames));
      }
    }
    // shots are contiguous (cuts) or overlap only by transition frames
    for (let i = 1; i < tl.clips.length; i++) {
      const prevEnd = tl.clips[i - 1].startFrame + tl.clips[i - 1].durationInFrames;
      expect(prevEnd - tl.clips[i].startFrame).toBe(['crossfade', 'wipe'].includes(tl.clips[i].transitionIn.type) ? tl.clips[i].transitionIn.frames : 0);
    }
    expect(tl.durationInFrames).toBe(tl.clips.at(-1)!.startFrame + tl.clips.at(-1)!.durationInFrames);

    // Replacing ONE line's audio leaves every other line's audio untouched.
    const before = new Map(lines.map((l) => [l.id, l.activeAudioId]));
    requestDialogueAudio(pid, { lineIds: [lines[0].id], regenerate: true });
    await drain('t', 60_000);
    const after = listDialogueAudio(pid).flatMap((s) => s.lines);
    expect(after.find((l) => l.id === lines[0].id)!.activeAudioId).not.toBe(before.get(lines[0].id));
    for (const l of after.slice(1)) expect(l.activeAudioId).toBe(before.get(l.id));
  }, 180_000);

  it('mixes all tracks to exactly the timeline duration without clipping', async () => {
    const pid = await makeApprovedProject();
    requestDialogueAudio(pid);
    await drain('t', 120_000);
    const m = tmpFile('.wav');
    writeWav(m, music(6, 'playful'));
    const asset = await importAsset({ sourcePath: m, originalName: 'm.wav', category: 'music', provenance: { source: 'demo' } });
    updateEditorSettings(pid, { musicAssetId: asset.id });
    void getDb().select().from(schema.projects).where(eq(schema.projects.id, pid)).get();
    const tl = buildTimeline(pid);
    expect(tl.audio.some((a) => a.track === 'music' && a.loop)).toBe(true);
    const out = tmpFile('.wav');
    await mixAudio(tl, out);
    const p = await probe(out);
    expect(p.durationSec).toBeCloseTo(tl.durationInFrames / tl.fps, 1);
    const { audioPeakDb } = await import('@/lib/rendering/render');
    expect((await audioPeakDb(out)).maxDb).toBeLessThan(-0.1);
  }, 180_000);
});
