import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import { approveCheckpoint, checkpointStatus, deriveStage } from '@/lib/approvals/service';
import { createProject, applyStoryDraft, getStory, upsertLine } from '@/lib/story/service';
import { parseScript } from '@/lib/story/draft';
import { planShots, listShots, updateShot, requestStartImage, requestShotVideo } from '@/lib/shots/service';
import { claimNext, processJob, getJob } from '@/lib/jobs/queue';
import { requestExport } from '@/lib/rendering/export';
import { saveTimeline } from '@/lib/timeline/builder';
import { makeApprovedProject, MINI_SCRIPT } from './fixtures';

describe('approval enforcement', () => {
  it('blocks production steps until the matching checkpoint is approved', async () => {
    const p = createProject({ title: 'Gate' });
    expect(() => approveCheckpoint(p.id, 'story')).toThrow(/at least one scene/);
    applyStoryDraft(p.id, parseScript(MINI_SCRIPT.replace(/AKI|Aki/g, 'Zed')));
    expect(() => planShots(p.id)).toThrow(/story/);
    expect(() => approveCheckpoint(p.id, 'art')).toThrow(/story/);
    approveCheckpoint(p.id, 'story');
    expect(deriveStage(p.id)).toBe('characters');
    planShots(p.id);
    expect(() => approveCheckpoint(p.id, 'art')).toThrow(/no approved sprite|no environment/);
  });

  it('marks approvals stale when approved content changes', async () => {
    const pid = await makeApprovedProject();
    expect(checkpointStatus(pid, 'story').state).toBe('approved');
    const line = getStory(pid).scenes[0].lines[0];
    upsertLine({ id: line.id, sceneId: line.sceneId, speakerName: line.speakerName, text: 'Edited after approval', emotion: line.emotion });
    expect(checkpointStatus(pid, 'story').state).toBe('stale');
    const shot = listShots(pid)[0];
    updateShot(shot.id, { durationSec: 9 });
    expect(checkpointStatus(pid, 'storyboard').state).toBe('stale');
    expect(() => requestStartImage(shot.id)).toThrow(/stale/);
  });

  it('never submits a costed job without a generation approval, even if its state is tampered with', async () => {
    const pid = await makeApprovedProject();
    const shot = listShots(pid)[1];
    updateShot(shot.id, { mode: 'B' });
    approveCheckpoint(pid, 'storyboard');
    const { job } = requestStartImage(shot.id);
    expect(job.state).toBe('AWAITING_APPROVAL');
    expect(claimNext('w')).toBeNull(); // not claimable
    getDb().update(schema.generationJobs).set({ state: 'QUEUED' }).where(eq(schema.generationJobs.id, job.id)).run();
    const claimed = claimNext('w')!;
    await processJob(claimed, 'w');
    expect(getJob(job.id)!.state).toBe('AWAITING_APPROVAL');
    expect(getJob(job.id)!.providerJobId).toBeNull();
    // Mode B video needs an approved start image first
    expect(() => requestShotVideo(shot.id)).toThrow(/start image/);
  });

  it('requires final review approval for final export, and preview does not', async () => {
    const pid = await makeApprovedProject();
    saveTimeline(pid);
    expect(() => requestExport(pid, 'final')).toThrow(/final/);
    expect(requestExport(pid, 'preview').jobId).toBeTruthy();
  });
});
