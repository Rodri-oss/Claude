import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, getDb, schema } from '@/lib/db';
import { createProject, applyStoryDraft, getStory, upsertLine } from '@/lib/story/service';
import { parseScript, estimateLineSec, draftToScript, generateTemplateDraft } from '@/lib/story/draft';
import { newId } from '@/lib/ids';
import { MINI_SCRIPT } from './fixtures';

describe('project persistence', () => {
  it('persists projects, style bible, scenes and dialogue across DB reconnects', () => {
    const seriesId = newId('ser');
    getDb().insert(schema.series).values({ id: seriesId, name: 'S' }).run();
    const p = createProject({ title: 'Persist me', presetId: 'horror', aspect: '9:16', targetDurationSec: 180, seriesId });
    applyStoryDraft(p.id, parseScript(MINI_SCRIPT));
    closeDb(); // simulate app restart
    const s = getStory(p.id);
    expect(s.project.title).toBe('Mini');
    expect(s.project.width).toBe(1080);
    expect(s.project.height).toBe(1920);
    expect(s.project.productionStyle).toBe('narration-first');
    expect(s.styleBible?.artStyle).toMatch(/Desaturated/);
    expect(s.scenes.map((x) => x.title)).toEqual(['One', 'Two']);
    expect(s.scenes[0].lines.map((l) => l.speakerName)).toEqual(['Aki', 'NARRATOR']);
    expect(s.scenes[0].actions).toEqual(['Aki runs across the lab.']);
    const ep = getDb().select().from(schema.episodes).where(eq(schema.episodes.projectId, p.id)).get();
    expect(ep?.number).toBe(1);
  });

  it('re-estimates runtime from speech + action when lines change', () => {
    const p = createProject({ title: 'Est' });
    applyStoryDraft(p.id, parseScript(MINI_SCRIPT));
    const before = getStory(p.id).scenes[1];
    upsertLine({ sceneId: before.id, speakerName: 'Aki', text: 'A much longer line that should clearly take several more seconds to say out loud, with pauses, and commas.', emotion: 'sad' });
    const after = getStory(p.id).scenes[1];
    expect(after.estDurationSec).toBeGreaterThan(before.estDurationSec + 3);
    expect(estimateLineSec('one two three four five', 'sad')).toBeGreaterThan(estimateLineSec('one two three four five', 'excited'));
  });

  it('round-trips the script format and produces template drafts without an AI key', () => {
    const d = parseScript(MINI_SCRIPT);
    expect(parseScript(draftToScript(d)).scenes).toEqual(d.scenes);
    const t = generateTemplateDraft({ idea: 'A robot finds a seed', presetId: 'scifi', targetDurationSec: 150 });
    expect(t.scenes.length).toBe(5);
    expect(t.generator).toBe('template');
  });
});
