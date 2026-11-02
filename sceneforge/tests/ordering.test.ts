import { describe, expect, it } from 'vitest';
import { listShots, reorderShots, moveShot, duplicateShot, createShot, deleteShot, setShotApproval } from '@/lib/shots/service';
import { getStory, reorderScenes } from '@/lib/story/service';
import { makeApprovedProject } from './fixtures';

describe('scene and shot ordering', () => {
  it('plans shots in scene order with contiguous sequence numbers', async () => {
    const pid = await makeApprovedProject();
    const shots = listShots(pid);
    const scenes = getStory(pid).scenes;
    expect(shots.map((s) => s.seq)).toEqual(shots.map((_, i) => i + 1));
    const sceneIdx = shots.map((s) => scenes.findIndex((x) => x.id === s.sceneId));
    expect([...sceneIdx].sort((a, b) => a - b)).toEqual(sceneIdx);
    expect(shots[0].camera.framing).toBe('establishing');
    expect(shots.some((s) => s.purpose.startsWith('Action:'))).toBe(true);
  });

  it('reorders, moves across scene boundaries, duplicates and deletes', async () => {
    const pid = await makeApprovedProject();
    const ids = listShots(pid).map((s) => s.id);
    expect(() => reorderShots(pid, ids.slice(1))).toThrow();
    expect(() => reorderShots(pid, [ids[0], ...ids.slice(0, -1)])).toThrow();
    // move the first shot of scene 2 earlier → it joins scene 1
    const scenes = getStory(pid).scenes;
    const firstOf2 = listShots(pid).find((s) => s.sceneId === scenes[1].id)!;
    moveShot(firstOf2.id, -1);
    expect(listShots(pid).find((s) => s.id === firstOf2.id)!.sceneId).toBe(scenes[0].id);
    const dup = duplicateShot(ids[1]);
    const after = listShots(pid);
    expect(after.findIndex((s) => s.id === dup)).toBe(after.findIndex((s) => s.id === ids[1]) + 1);
    expect(after.find((s) => s.id === dup)!.activeVersionId).toBeNull();
    const created = createShot(pid, scenes[1].id);
    expect(listShots(pid).at(-1)!.id).toBe(created);
    setShotApproval(created, 'approved');
    expect(() => deleteShot(created)).toThrow(/Approved/);
    setShotApproval(created, 'rejected');
    deleteShot(created);
    expect(listShots(pid).map((s) => s.seq)).toEqual(listShots(pid).map((_, i) => i + 1));
  });

  it('reordering scenes reorders the shot list', async () => {
    const pid = await makeApprovedProject();
    const [a, b] = getStory(pid).scenes;
    reorderScenes(pid, [b.id, a.id]);
    expect(listShots(pid)[0].sceneId).toBe(b.id);
  });
});
