import sharp from 'sharp';
import { tmpFile } from '@/lib/assets/storage';
import { importAsset } from '@/lib/assets/service';
import { addVariant, createCharacter, rebuildRig, setContinuity, setLocked, CONTINUITY_ITEMS } from '@/lib/characters/service';
import { addLayer, createEnvironment, setEnvironmentLocked } from '@/lib/environments/service';
import { createProject, applyStoryDraft } from '@/lib/story/service';
import { parseScript } from '@/lib/story/draft';
import { approveCheckpoint } from '@/lib/approvals/service';
import { planShots } from '@/lib/shots/service';
import { registerHandlers } from '@/lib/jobs/handlers';

export async function png(w: number, h: number, color: string, name = 'x.png', category = 'character') {
  const f = tmpFile('.png');
  await sharp({ create: { width: w, height: h, channels: 4, background: color } }).png().toFile(f);
  return importAsset({ sourcePath: f, originalName: name, category, projectId: null, provenance: { source: 'import' }, move: true });
}

/** A locked character with a full layered rig (pose, faces, blink, mouths) made of tiny solid PNGs. */
export async function makeCharacter(name: string) {
  const c = createCharacter({ name });
  const add = async (kind: Parameters<typeof addVariant>[1]['kind'], vname: string, color: string) => addVariant(c.id, { kind, name: vname, assetId: (await png(60, 120, color, `${name}-${kind}-${vname}.png`)).id, approved: true });
  await add('pose', 'idle', '#ff0000');
  await add('expression', 'neutral', '#00000000');
  await add('expression', 'happy', '#00000000');
  await add('eyes', 'closed', '#00000000');
  for (const m of ['closed', 'open', 'wide']) await add('mouth', m, '#00000000');
  await add('fullbody', 'front', '#ff0000');
  rebuildRig(c.id);
  for (const i of CONTINUITY_ITEMS) setContinuity(c.id, i, true);
  setLocked(c.id, true);
  return c.id;
}

export async function makeEnvironment(name: string) {
  const id = createEnvironment({ name });
  addLayer(id, { assetId: (await png(320, 180, '#3366aa', `${name}-bg.png`, 'background')).id, role: 'background' });
  addLayer(id, { assetId: (await png(320, 180, '#00000000', `${name}-fg.png`, 'background')).id, role: 'foreground' });
  setEnvironmentLocked(id, true);
  return id;
}

export const MINI_SCRIPT = `TITLE: Mini
CHARACTER: Aki | test | test
LOCATION: Lab
SCENE: One @ Lab
> Aki runs across the lab.
AKI (excited): Hello there, this is a test line.
NARRATOR: A short narration.
SCENE: Two @ Lab
AKI (sad): Second scene line.
`;

/** Project through story, art and storyboard approval. */
export async function makeApprovedProject(opts: { title?: string; aspect?: '16:9' | '9:16' } = {}) {
  registerHandlers();
  await makeCharacter('Aki');
  await makeEnvironment('Lab');
  const p = createProject({ title: opts.title ?? 'Mini', presetId: 'adventure', aspect: opts.aspect ?? '16:9', budgetLimitUsd: 50 });
  applyStoryDraft(p.id, parseScript(MINI_SCRIPT));
  approveCheckpoint(p.id, 'story');
  approveCheckpoint(p.id, 'art');
  planShots(p.id);
  approveCheckpoint(p.id, 'storyboard');
  return p.id;
}
