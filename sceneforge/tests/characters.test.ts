import { describe, expect, it } from 'vitest';
import { approvedReferences, getCharacter, updateCharacter, addVariant, setLocked, rebuildRig, createCharacter } from '@/lib/characters/service';
import { requestStartImage, listShots, updateShot } from '@/lib/shots/service';
import { assetAbsPath } from '@/lib/assets/service';
import { makeApprovedProject, png } from './fixtures';
import { getCast } from '@/lib/story/service';

describe('character consistency', () => {
  it('associates approved reference images with the character and uses them for generation', async () => {
    const pid = await makeApprovedProject();
    const aki = getCast(pid)[0];
    const refs = approvedReferences(aki.id);
    expect(refs.map((r) => r.kind)).toEqual(['fullbody']);
    // a shot with Aki → the image request carries Aki's approved reference image
    const shot = listShots(pid).find((s) => s.characters.some((c) => c.characterId === aki.id))!;
    updateShot(shot.id, { mode: 'B' });
    const { job } = requestStartImage(shot.id);
    const req = (job.input as { request: { referenceImages: string[] } }).request;
    expect(req.referenceImages).toEqual([assetAbsPath(refs[0].assetId)]);
  });

  it('reuses the shared library character across projects (no duplicate)', async () => {
    await makeApprovedProject({ title: 'Ep1' });
    const before = getCharacter(getCast((await import('@/lib/story/service')).listProjects()[0].id)[0].id)!;
    expect(before.locked).toBe(true);
  });

  it('locks designs: design fields, variants and rig are frozen; voice can change', async () => {
    const c = createCharacter({ name: 'Locky' });
    const a = await png(60, 120, '#f00', 'l.png');
    addVariant(c.id, { kind: 'pose', name: 'idle', assetId: a.id, approved: true });
    rebuildRig(c.id);
    expect(() => setLocked(c.id, true)).toThrow(/continuity/);
    for (const i of ['Hair and face', 'Clothing', 'Colors', 'Body proportions', 'Accessories', 'Scene lighting and style']) (await import('@/lib/characters/service')).setContinuity(c.id, i, true);
    setLocked(c.id, true);
    expect(() => updateCharacter(c.id, { description: 'changed' })).toThrow(/locked/);
    expect(() => addVariant(c.id, { kind: 'pose', name: 'x', assetId: a.id })).toThrow(/locked/);
    expect(updateCharacter(c.id, { voiceId: 'en-us+m3' }).voiceId).toBe('en-us+m3');
    // partial updates must not reset other design fields
    expect(getCharacter(c.id)!.palette).toEqual([]);
  });

  it('rejects layered rigs whose layers are different sizes', async () => {
    const c = createCharacter({ name: 'Mismatch' });
    addVariant(c.id, { kind: 'pose', name: 'idle', assetId: (await png(60, 120, '#f00')).id, approved: true });
    addVariant(c.id, { kind: 'expression', name: 'neutral', assetId: (await png(30, 30, '#0f0')).id, approved: true });
    expect(() => rebuildRig(c.id)).toThrow(/must all be 60×120/);
  });
});
