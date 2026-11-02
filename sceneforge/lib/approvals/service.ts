import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { hashOf, newId } from '../ids';
import type { Checkpoint } from '../types';

export class ApprovalRequiredError extends Error {
  constructor(public readonly checkpoint: Checkpoint, message?: string) {
    super(message ?? `Checkpoint "${checkpoint}" must be approved first`);
  }
}

export class PrerequisiteError extends Error {}

/** Hash of the content a checkpoint approves. Any edit changes the hash and makes the approval stale. */
export function contentHash(projectId: string, checkpoint: Checkpoint): string {
  const db = getDb();
  switch (checkpoint) {
    case 'story': {
      const scenes = db.select().from(schema.scenes).where(eq(schema.scenes.projectId, projectId)).orderBy(asc(schema.scenes.seq)).all();
      const lines = db.select().from(schema.dialogueLines).where(eq(schema.dialogueLines.projectId, projectId)).all();
      return hashOf({
        scenes: scenes.map((s) => ({ id: s.id, seq: s.seq, t: s.title, d: s.description, l: s.locationName, a: s.actions, tone: s.tone })),
        lines: lines
          .sort((a, b) => (a.sceneId + String(a.seq).padStart(5, '0')).localeCompare(b.sceneId + String(b.seq).padStart(5, '0')))
          .map((l) => ({ s: l.sceneId, q: l.seq, sp: l.speakerName, c: l.characterId, t: l.text, e: l.emotion })),
      });
    }
    case 'art': {
      const cast = db
        .select({ c: schema.characters })
        .from(schema.projectCharacters)
        .innerJoin(schema.characters, eq(schema.characters.id, schema.projectCharacters.characterId))
        .where(eq(schema.projectCharacters.projectId, projectId))
        .all()
        .map((r) => r.c);
      const envIds = [...new Set(db.select({ e: schema.scenes.environmentId }).from(schema.scenes).where(eq(schema.scenes.projectId, projectId)).all().map((r) => r.e).filter(Boolean))] as string[];
      const layers = envIds.length ? db.select().from(schema.environmentLayers).where(inArray(schema.environmentLayers.environmentId, envIds)).all() : [];
      const bible = db.select().from(schema.styleBibles).where(eq(schema.styleBibles.projectId, projectId)).get();
      return hashOf({
        cast: cast.map((c) => ({ id: c.id, rig: c.rig, locked: c.locked })).sort((a, b) => a.id.localeCompare(b.id)),
        envs: envIds.sort(),
        layers: layers.map((l) => [l.environmentId, l.assetId, l.order, l.parallax]).sort(),
        bible: bible ? [bible.artStyle, bible.palette, bible.lineWork, bible.lighting] : null,
      });
    }
    case 'storyboard': {
      const shots = db.select().from(schema.shots).where(eq(schema.shots.projectId, projectId)).all();
      return hashOf(
        shots
          .map((s) => ({ id: s.id, sc: s.sceneId, q: s.seq, d: s.durationSec, m: s.mode, cam: s.camera, ch: s.characters, env: s.environmentId, ip: s.imagePrompt, mp: s.motionPrompt, dl: s.dialogueLineIds, fx: s.effects }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      );
    }
    case 'final': {
      const tl = db.select().from(schema.timelines).where(eq(schema.timelines.projectId, projectId)).orderBy(desc(schema.timelines.version)).get();
      return tl?.hash ?? '';
    }
    case 'generation':
      return '';
  }
}

export type CheckpointState = 'none' | 'approved' | 'stale' | 'rejected';

export function checkpointStatus(projectId: string, checkpoint: Checkpoint): { state: CheckpointState; approval: typeof schema.approvals.$inferSelect | null } {
  const db = getDb();
  const latest = db
    .select()
    .from(schema.approvals)
    .where(and(eq(schema.approvals.projectId, projectId), eq(schema.approvals.checkpoint, checkpoint)))
    .orderBy(desc(schema.approvals.createdAt), desc(schema.approvals.id))
    .get();
  if (!latest || latest.decision === 'revoked') return { state: 'none', approval: latest ?? null };
  if (latest.decision === 'rejected') return { state: 'rejected', approval: latest };
  if (checkpoint !== 'generation' && latest.snapshotHash !== contentHash(projectId, checkpoint)) return { state: 'stale', approval: latest };
  return { state: 'approved', approval: latest };
}

export function allCheckpoints(projectId: string) {
  return {
    story: checkpointStatus(projectId, 'story'),
    art: checkpointStatus(projectId, 'art'),
    storyboard: checkpointStatus(projectId, 'storyboard'),
    final: checkpointStatus(projectId, 'final'),
  };
}

export function isApproved(projectId: string, checkpoint: Checkpoint) {
  return checkpointStatus(projectId, checkpoint).state === 'approved';
}

export function requireApproved(projectId: string, checkpoint: Checkpoint) {
  const s = checkpointStatus(projectId, checkpoint);
  if (s.state === 'stale') throw new ApprovalRequiredError(checkpoint, `"${checkpoint}" approval is stale — content changed since it was approved. Re-approve to continue.`);
  if (s.state !== 'approved') throw new ApprovalRequiredError(checkpoint);
}

const ORDER: Checkpoint[] = ['story', 'art', 'storyboard', 'final'];

function checkPrerequisites(projectId: string, checkpoint: Checkpoint) {
  const db = getDb();
  const idx = ORDER.indexOf(checkpoint);
  for (let i = 0; i < idx; i++) requireApproved(projectId, ORDER[i]);
  if (checkpoint === 'story') {
    const n = db.select({ id: schema.scenes.id }).from(schema.scenes).where(eq(schema.scenes.projectId, projectId)).all().length;
    if (!n) throw new PrerequisiteError('Add at least one scene before approving the story');
  }
  if (checkpoint === 'art') {
    const cast = db
      .select({ c: schema.characters })
      .from(schema.projectCharacters)
      .innerJoin(schema.characters, eq(schema.characters.id, schema.projectCharacters.characterId))
      .where(eq(schema.projectCharacters.projectId, projectId))
      .all()
      .map((r) => r.c);
    const problems: string[] = [];
    for (const c of cast) {
      if (!c.rig || !Object.keys(c.rig.poses).length) problems.push(`${c.name} has no approved sprite/reference art`);
      else if (!c.locked) problems.push(`${c.name}'s design is not locked`);
    }
    const scenes = db.select().from(schema.scenes).where(eq(schema.scenes.projectId, projectId)).all();
    for (const s of scenes) if (!s.environmentId) problems.push(`Scene "${s.title}" has no environment assigned`);
    if (problems.length) throw new PrerequisiteError(`Art approval blocked: ${problems.join('; ')}`);
  }
  if (checkpoint === 'storyboard') {
    const n = db.select({ id: schema.shots.id }).from(schema.shots).where(eq(schema.shots.projectId, projectId)).all().length;
    if (!n) throw new PrerequisiteError('Plan shots before approving the storyboard');
  }
  if (checkpoint === 'final') {
    if (!contentHash(projectId, 'final')) throw new PrerequisiteError('Build the timeline before final review');
  }
}

export function approveCheckpoint(projectId: string, checkpoint: Exclude<Checkpoint, 'generation'>, note = '', amountUsd = 0) {
  checkPrerequisites(projectId, checkpoint);
  const db = getDb();
  const id = newId('apr');
  db.insert(schema.approvals)
    .values({ id, projectId, checkpoint, decision: 'approved', snapshotHash: contentHash(projectId, checkpoint), scope: {}, amountUsd, note })
    .run();
  if (checkpoint === 'art') {
    db.update(schema.styleBibles).set({ locked: true }).where(eq(schema.styleBibles.projectId, projectId)).run();
  }
  advanceStage(projectId);
  return id;
}

export function rejectCheckpoint(projectId: string, checkpoint: Checkpoint, note = '') {
  const id = newId('apr');
  getDb().insert(schema.approvals).values({ id, projectId, checkpoint, decision: 'rejected', snapshotHash: '', scope: {}, note }).run();
  advanceStage(projectId);
  return id;
}

export function revokeCheckpoint(projectId: string, checkpoint: Checkpoint, note = '') {
  const id = newId('apr');
  getDb().insert(schema.approvals).values({ id, projectId, checkpoint, decision: 'revoked', snapshotHash: '', scope: {}, note }).run();
  if (checkpoint === 'art') getDb().update(schema.styleBibles).set({ locked: false }).where(eq(schema.styleBibles.projectId, projectId)).run();
  advanceStage(projectId);
  return id;
}

/** Derive the workflow stage from approvals + content so it can never drift out of sync. */
export function deriveStage(projectId: string): string {
  const db = getDb();
  const hasScenes = db.select({ id: schema.scenes.id }).from(schema.scenes).where(eq(schema.scenes.projectId, projectId)).limit(1).all().length > 0;
  if (!hasScenes) return 'idea';
  if (!isApproved(projectId, 'story')) return 'script';
  if (!isApproved(projectId, 'art')) return 'characters';
  if (!isApproved(projectId, 'storyboard')) return 'storyboard';
  const tl = db.select({ id: schema.timelines.id }).from(schema.timelines).where(eq(schema.timelines.projectId, projectId)).limit(1).all().length > 0;
  if (!tl) return 'animation';
  if (!isApproved(projectId, 'final')) return 'review';
  return 'export';
}

export function advanceStage(projectId: string) {
  getDb().update(schema.projects).set({ stage: deriveStage(projectId), updatedAt: new Date().toISOString() }).where(eq(schema.projects.id, projectId)).run();
}

export function listApprovals(projectId: string) {
  return getDb().select().from(schema.approvals).where(eq(schema.approvals.projectId, projectId)).orderBy(desc(schema.approvals.createdAt)).all();
}
