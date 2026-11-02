import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { approveCheckpoint } from '@/lib/approvals/service';
import { requestDialogueAudio } from '@/lib/audio/service';
import { drain, getJob } from '@/lib/jobs/queue';
import { saveTimeline } from '@/lib/timeline/builder';
import { requestExport, getExport } from '@/lib/rendering/export';
import { resolveDataPath } from '@/lib/assets/storage';
import { probe, verifyDecodable } from '@/lib/media/ffmpeg';
import { listShots, requestStartImage, requestShotVideo, setVersionStatus, updateShot } from '@/lib/shots/service';
import { approveJobs } from '@/lib/jobs/queue';
import { makeApprovedProject } from '../fixtures';

describe('final export (real Remotion + FFmpeg render)', () => {
  it('renders a validated H.264/AAC MP4 with SRT, scene files and manifest; replacing a clip leaves other shots untouched', async () => {
    const pid = await makeApprovedProject();
    // one mock AI shot (Mode B) to exercise video clips in the composition
    const b = listShots(pid)[1];
    updateShot(b.id, { mode: 'B' });
    approveCheckpoint(pid, 'storyboard');
    approveJobs(pid, [requestStartImage(b.id).job.id]);
    await drain('e2e');
    setVersionStatus(listShots(pid).find((s) => s.id === b.id)!.startImageVersionId!, 'approved');
    approveJobs(pid, [requestShotVideo(b.id).job.id]);
    requestDialogueAudio(pid);
    await drain('e2e', 120_000);
    const before = listShots(pid).map((s) => ({ id: s.id, active: s.activeVersionId, start: s.startImageVersionId }));

    // Replace the AI clip with a new variation: only that shot changes.
    setVersionStatus(listShots(pid).find((s) => s.id === b.id)!.activeVersionId!, 'approved');
    approveJobs(pid, [requestShotVideo(b.id, { regenerate: true, variant: 2 }).job.id]);
    await drain('e2e');
    const after = listShots(pid);
    const bAfter = after.find((s) => s.id === b.id)!;
    expect(bAfter.versions.filter((v) => v.kind === 'video').length).toBe(2);
    expect(bAfter.activeVersionId).toBe(before.find((x) => x.id === b.id)!.active); // approved take is not displaced automatically
    setVersionStatus(bAfter.versions.find((v) => v.kind === 'video' && v.version === 2)!.id, 'approved');
    for (const s of after.filter((x) => x.id !== b.id)) {
      const o = before.find((x) => x.id === s.id)!;
      expect([s.activeVersionId, s.startImageVersionId]).toEqual([o.active, o.start]);
    }

    saveTimeline(pid);
    approveCheckpoint(pid, 'final');
    const { exportId, jobId } = requestExport(pid, 'final');
    await drain('e2e', 900_000);
    expect(getJob(jobId)!.state, getJob(jobId)!.error ?? '').toBe('COMPLETED');
    const e = getExport(exportId)!;
    const v = resolveDataPath(e.videoPath!);
    const p = await probe(v);
    expect(p.video?.codec).toBe('h264');
    expect(p.audio?.codec).toBe('aac');
    expect([p.video?.width, p.video?.height, Math.round(p.video!.fps)]).toEqual([1920, 1080, 24]);
    expect((await verifyDecodable(v)).ok).toBe(true);
    const val = e.validation as { reasons: string[] };
    // The mini project is shorter than 120 s, so the only acceptable warning is the runtime range.
    expect(val.reasons.every((r) => /runtime/.test(r))).toBe(true);
    expect(fs.readFileSync(resolveDataPath(e.srtPath!), 'utf8')).toMatch(/00:00:\d\d,\d{3} --> /);
    expect(e.sceneFiles.length).toBe(2);
    const manifest = JSON.parse(fs.readFileSync(resolveDataPath(e.manifestPath!), 'utf8'));
    expect(manifest.containsMockContent).toBe(true);
    expect(manifest.shots.length).toBe(listShots(pid).length);
  });
});
