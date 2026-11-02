/**
 * Story drafts: structured story output, script parsing, runtime estimation and the
 * no-API-key template generator. Pure functions — no DB access — so they're easy to test.
 */
import { z } from 'zod';
import { getPreset } from './presets';

export const LineDraft = z.object({
  speaker: z.string().min(1).max(60),
  text: z.string().min(1).max(2000),
  emotion: z.string().max(40).default('neutral'),
});
export type LineDraft = z.infer<typeof LineDraft>;

export const SceneDraft = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).default(''),
  location: z.string().max(200).default(''),
  tone: z.string().max(80).default(''),
  beatStart: z.string().max(400).default(''),
  beatEnd: z.string().max(400).default(''),
  actions: z.array(z.string().max(1000)).default([]),
  lines: z.array(LineDraft).default([]),
});
export type SceneDraft = z.infer<typeof SceneDraft>;

export const StoryDraft = z.object({
  title: z.string().min(1).max(200),
  logline: z.string().max(1000).default(''),
  synopsis: z.string().max(8000).default(''),
  genre: z.string().default('custom'),
  audience: z.string().default('General'),
  characters: z
    .array(z.object({ name: z.string().min(1).max(60), description: z.string().default(''), personality: z.string().default(''), role: z.string().default('supporting') }))
    .default([]),
  locations: z.array(z.object({ name: z.string().min(1), description: z.string().default('') })).default([]),
  beats: z.array(z.string()).default([]),
  scenes: z.array(SceneDraft).min(1),
  generator: z.string().default('manual'),
});
export type StoryDraft = z.infer<typeof StoryDraft>;

export const NARRATOR = 'NARRATOR';

// --------------------------------------------------------------------------------------------
// Runtime estimation (speech + action + pauses + transitions, not word count alone)
// --------------------------------------------------------------------------------------------

const EMOTION_WPS: Record<string, number> = {
  neutral: 2.6,
  happy: 2.8,
  excited: 3.0,
  angry: 2.9,
  shouting: 2.8,
  sad: 2.1,
  worried: 2.4,
  whisper: 2.0,
  surprised: 2.7,
  calm: 2.3,
};
const ACTION_HEAVY = /\b(fight|fights|run|runs|chase|chases|explod|crash|leap|jump|battle|strike|attack|fall|falls|dash|races?|flee)/i;

export function estimateLineSec(text: string, emotion = 'neutral', speed = 1): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const wps = (EMOTION_WPS[emotion.toLowerCase()] ?? 2.6) * Math.max(0.5, Math.min(2, speed));
  const sentences = Math.max(1, (text.match(/[.!?…]+/g) || []).length);
  const commas = (text.match(/[,;:—-]/g) || []).length;
  return words / wps + (sentences - 1) * 0.3 + commas * 0.12 + 0.15;
}

export function estimateActionSec(action: string): number {
  return ACTION_HEAVY.test(action) ? 3.5 : 2.5;
}

export const LINE_GAP_SEC = 0.35;
export const SCENE_TRANSITION_SEC = 0.6;

export function estimateSceneSec(scene: Pick<SceneDraft, 'lines' | 'actions'>): number {
  const speech = scene.lines.reduce((s, l) => s + estimateLineSec(l.text, l.emotion), 0);
  const gaps = Math.max(0, scene.lines.length - 1) * LINE_GAP_SEC;
  const action = scene.actions.reduce((s, a) => s + estimateActionSec(a), 0);
  return Math.max(6, speech + gaps + action + SCENE_TRANSITION_SEC + 1.0);
}

export function estimateStorySec(draft: Pick<StoryDraft, 'scenes'>): number {
  return draft.scenes.reduce((s, sc) => s + estimateSceneSec(sc), 0);
}

// --------------------------------------------------------------------------------------------
// Script parser
// --------------------------------------------------------------------------------------------

/**
 * Accepted plain-text format (Markdown/Fountain-ish):
 *
 *   TITLE: The Lantern Courier
 *   LOGLINE: ...
 *   CHARACTER: Miko | A determined courier | stubborn, kind
 *   LOCATION: Market Street | Busy dawn market
 *
 *   SCENE: The Delivery @ Market Street [tone: hopeful]       (also "## Title", "INT. PLACE - DAY")
 *   > Miko sprints through the crowd.                         (action line; plain prose works too)
 *   MIKO (excited): We're going to make it!                    (dialogue: NAME (emotion): text)
 *   NARRATOR: The city was waking up.
 */
export function parseScript(text: string): StoryDraft {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let title = '';
  let logline = '';
  let genre = 'custom';
  const characters: StoryDraft['characters'] = [];
  const locations: StoryDraft['locations'] = [];
  const scenes: SceneDraft[] = [];
  let cur: SceneDraft | null = null;

  const startScene = (raw: string) => {
    let t = raw.trim();
    let tone = '';
    const toneM = t.match(/\[tone:\s*([^\]]+)\]/i);
    if (toneM) {
      tone = toneM[1].trim();
      t = t.replace(toneM[0], '').trim();
    }
    let location = '';
    const at = t.split('@');
    if (at.length > 1) {
      location = at.slice(1).join('@').trim();
      t = at[0].trim();
    }
    const slug = t.match(/^(INT\.|EXT\.|INT\/EXT\.?)\s*(.+?)(?:\s+-\s+(.+))?$/i);
    if (slug && !location) location = slug[2].trim();
    cur = SceneDraft.parse({ title: t || `Scene ${scenes.length + 1}`, location, tone, lines: [], actions: [] });
    scenes.push(cur);
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^TITLE:\s*(.+)$/i))) {
      title = m[1].trim();
      continue;
    }
    if ((m = line.match(/^LOGLINE:\s*(.+)$/i))) {
      logline = m[1].trim();
      continue;
    }
    if ((m = line.match(/^GENRE:\s*(.+)$/i))) {
      genre = m[1].trim().toLowerCase();
      continue;
    }
    if ((m = line.match(/^CHARACTER:\s*(.+)$/i))) {
      const [name, description = '', personality = ''] = m[1].split('|').map((s) => s.trim());
      characters.push({ name, description, personality, role: characters.length === 0 ? 'lead' : 'supporting' });
      continue;
    }
    if ((m = line.match(/^LOCATION:\s*(.+)$/i))) {
      const [name, description = ''] = m[1].split('|').map((s) => s.trim());
      locations.push({ name, description });
      continue;
    }
    if ((m = line.match(/^(?:SCENE(?:\s*\d+)?\s*[:.-]\s*|#{1,3}\s+)(.+)$/i)) || (m = line.match(/^((?:INT\.|EXT\.|INT\/EXT).+)$/i))) {
      startScene(m[1]);
      continue;
    }
    if (!cur) startScene(`Scene ${scenes.length + 1}`);
    const scene = cur as unknown as SceneDraft;
    if ((m = line.match(/^>\s*(.+)$/))) {
      scene.actions.push(m[1].trim());
      continue;
    }
    if ((m = line.match(/^([A-Z][A-Za-z0-9 .'-]{0,40}?)\s*(?:\(([^)]+)\))?\s*:\s*(.+)$/)) && m[1] === m[1].toUpperCase()) {
      const speaker = m[1].trim();
      scene.lines.push({ speaker: speaker === 'NARRATION' || speaker === 'VO' ? NARRATOR : speaker, emotion: (m[2] || 'neutral').trim().toLowerCase(), text: m[3].trim() });
      continue;
    }
    if (!scene.description) scene.description = line;
    else scene.actions.push(line);
  }
  if (!scenes.length) throw new Error('No scenes found in script');

  // Auto-register speakers that weren't declared with CHARACTER:
  const known = new Set(characters.map((c) => c.name.toUpperCase()));
  for (const s of scenes)
    for (const l of s.lines)
      if (l.speaker !== NARRATOR && !known.has(l.speaker.toUpperCase())) {
        known.add(l.speaker.toUpperCase());
        characters.push({ name: titleCase(l.speaker), description: '', personality: '', role: 'supporting' });
      }
  for (const s of scenes) if (s.location && !locations.some((l) => l.name.toLowerCase() === s.location.toLowerCase())) locations.push({ name: s.location, description: '' });

  return StoryDraft.parse({
    title: title || scenes[0].title,
    logline,
    genre,
    characters,
    locations,
    beats: scenes.map((s) => s.title),
    scenes,
    generator: 'script-parser',
  });
}

export function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Serialize a draft back into the script format (used by the script editor). */
export function draftToScript(d: StoryDraft): string {
  const out: string[] = [`TITLE: ${d.title}`];
  if (d.logline) out.push(`LOGLINE: ${d.logline}`);
  if (d.genre) out.push(`GENRE: ${d.genre}`);
  for (const c of d.characters) out.push(`CHARACTER: ${c.name} | ${c.description} | ${c.personality}`.replace(/( \| )+$/, ''));
  for (const l of d.locations) out.push(`LOCATION: ${l.name}${l.description ? ` | ${l.description}` : ''}`);
  for (const s of d.scenes) {
    out.push('', `SCENE: ${s.title}${s.location ? ` @ ${s.location}` : ''}${s.tone ? ` [tone: ${s.tone}]` : ''}`);
    if (s.description) out.push(s.description);
    for (const a of s.actions) out.push(`> ${a}`);
    for (const l of s.lines) out.push(`${l.speaker.toUpperCase()}${l.emotion && l.emotion !== 'neutral' ? ` (${l.emotion})` : ''}: ${l.text}`);
  }
  return out.join('\n');
}

// --------------------------------------------------------------------------------------------
// Template generator — deterministic, works with no AI key. Produces an editable first draft.
// It is honest boilerplate structured around the user's idea; an LLM adapter can replace it.
// --------------------------------------------------------------------------------------------

const NAME_POOL = ['Aki', 'Rena', 'Toma', 'Juno', 'Kai', 'Mira', 'Oren', 'Suki', 'Bram', 'Lio'];

export function generateTemplateDraft(input: { idea: string; presetId: string; targetDurationSec: number; castNames?: string[]; title?: string }): StoryDraft {
  const preset = getPreset(input.presetId);
  const idea = input.idea.trim().replace(/\s+/g, ' ') || 'An unexpected day changes everything';
  const seed = [...idea].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const names = input.castNames?.length ? input.castNames : [NAME_POOL[seed % NAME_POOL.length], NAME_POOL[(seed + 3) % NAME_POOL.length]];
  const [hero, ally] = [names[0], names[1] ?? NAME_POOL[(seed + 5) % NAME_POOL.length]];
  const sceneCount = Math.max(3, Math.min(8, Math.round(input.targetDurationSec / 30)));
  const beats = preset.beats.slice(0, sceneCount);
  while (beats.length < sceneCount) beats.splice(beats.length - 1, 0, `Complication ${beats.length}`);
  const narr = preset.productionStyle === 'narration-first';
  const shortIdea = idea.length > 90 ? `${idea.slice(0, 87)}…` : idea;
  const perSceneSec = input.targetDurationSec / sceneCount;
  const locs = ['Opening location', 'Crossroads', 'Hidden place', 'Turning point', 'Final stage'];

  const scenes: SceneDraft[] = beats.map((beat, i) => {
    const tone = preset.tones[i % preset.tones.length];
    const location = locs[Math.min(i, locs.length - 1)];
    const lines: LineDraft[] = [];
    if (narr || i === 0) lines.push({ speaker: NARRATOR, emotion: 'calm', text: `${beat}. ${i === 0 ? shortIdea + '.' : `For ${hero}, nothing would be simple now.`}` });
    const lineBank: [string, string, string][] = [
      [hero, 'neutral', `So this is where it starts. ${beat}.`],
      [ally, 'worried', `${hero}, are you sure about this? It feels different this time.`],
      [hero, 'determined', `I'm sure. If we stop now, we'll never know what really happened.`],
      [ally, 'surprised', `Wait — did you see that? Over there!`],
      [hero, 'excited', `That's it. That's what we've been looking for. Let's go!`],
      [ally, 'happy', `Okay, okay. But next time, you're carrying the bags.`],
    ];
    // Fill roughly 55% of the scene's time with speech.
    let spoken = lines.reduce((s, l) => s + estimateLineSec(l.text, l.emotion), 0);
    let k = (i * 2) % lineBank.length;
    let guard = 0;
    while (spoken < perSceneSec * 0.55 && guard++ < 12) {
      const [speaker, emotion, text] = lineBank[k % lineBank.length];
      lines.push({ speaker, emotion, text });
      spoken += estimateLineSec(text, emotion) + LINE_GAP_SEC;
      k++;
    }
    return {
      title: beat,
      description: `${beat}: ${hero} and ${ally} in the ${location.toLowerCase()} — ${tone} mood. (Template draft: rewrite to fit your story.)`,
      location,
      tone,
      beatStart: i === 0 ? 'Status quo' : beats[i - 1],
      beatEnd: beat,
      actions: i === Math.floor(sceneCount / 2) ? [`${hero} runs toward the source of the trouble.`] : [`${hero} looks around, taking it in.`],
      lines,
    };
  });

  return StoryDraft.parse({
    title: input.title?.trim() || titleCase(shortIdea.split(/[.,;:!?]/)[0].split(' ').slice(0, 6).join(' ')),
    logline: `${preset.name}: ${shortIdea}`,
    synopsis: `${idea}\n\nStructure (${preset.name}): ${beats.join(' → ')}.`,
    genre: preset.genre,
    audience: 'General',
    characters: [
      { name: hero, description: 'Protagonist (edit design notes)', personality: 'Driven, curious', role: 'lead' },
      { name: ally, description: 'Companion (edit design notes)', personality: 'Cautious, funny', role: 'supporting' },
    ],
    locations: [...new Set(scenes.map((s) => s.location))].map((name) => ({ name, description: '' })),
    beats,
    scenes,
    generator: 'template',
  });
}
