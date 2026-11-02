'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ActionButton, Button, Card, Field, inputCls } from '@/components/ui';
import { CAMERA_MOVES, FRAMINGS, TRANSITIONS, WEATHER, type ShotCharacter, type ShotEffects, type ShotCamera, type GenerationSettings } from '@/lib/types';

type Shot = {
  id: string;
  seq: number;
  purpose: string;
  durationSec: number;
  mode: string;
  transitionIn: string;
  environmentId: string | null;
  camera: ShotCamera;
  effects: ShotEffects;
  characters: ShotCharacter[];
  dialogueLineIds: string[];
  imagePrompt: string;
  motionPrompt: string;
  negativePrompt: string;
  imageModel: string;
  videoModel: string;
  generation: GenerationSettings;
  sfx: { assetId: string; at: number; volume: number }[];
};

export function ShotEditor({ shot, lines, cast, envs, imageModels, videoModels, sfx }: { shot: Shot; lines: { id: string; label: string }[]; cast: { id: string; name: string; poses: string[]; faces: string[] }[]; envs: { id: string; name: string }[]; imageModels: { id: string; label: string }[]; videoModels: { id: string; label: string }[]; sfx: { id: string; name: string }[] }) {
  const [s, setS] = useState<Shot>(structuredClone(shot));
  const set = <K extends keyof Shot>(k: K, v: Shot[K]) => setS((x) => ({ ...x, [k]: v }));
  const setCam = (k: keyof ShotCamera, v: unknown) => setS((x) => ({ ...x, camera: { ...x.camera, [k]: v } }));
  const setFx = (k: keyof ShotEffects, v: unknown) => setS((x) => ({ ...x, effects: { ...x.effects, [k]: v } }));
  const setChar = (i: number, patch: Partial<ShotCharacter>) => setS((x) => ({ ...x, characters: x.characters.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const sel = `${inputCls} text-xs`;
  return (
    <Card title={`Shot #${shot.seq}`} actions={<Link href="?" scroll={false} className="text-xs text-muted hover:text-fg">Close</Link>}>
      <div className="space-y-3 text-xs">
        <Field label="Story purpose">
          <input className={sel} value={s.purpose} onChange={(e) => set('purpose', e.target.value)} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Duration (s)" hint="Audio may extend it">
            <input type="number" step={0.1} min={0.5} max={30} className={sel} value={s.durationSec} onChange={(e) => set('durationSec', Number(e.target.value))} />
          </Field>
          <Field label="Animation mode">
            <select className={sel} value={s.mode} onChange={(e) => set('mode', e.target.value)}>
              <option value="A">A — Limited 2D</option>
              <option value="B">B — AI image→video</option>
              <option value="C">C — Still + camera</option>
            </select>
          </Field>
          <Field label="Transition in">
            <select className={sel} value={s.transitionIn} onChange={(e) => set('transitionIn', e.target.value)}>
              {TRANSITIONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Framing">
            <select className={sel} value={s.camera.framing} onChange={(e) => setCam('framing', e.target.value)}>
              {FRAMINGS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Camera move">
            <select className={sel} value={s.camera.move} onChange={(e) => setCam('move', e.target.value)}>
              {CAMERA_MOVES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Intensity">
            <input type="number" step={0.1} min={0} max={2} className={sel} value={s.camera.intensity} onChange={(e) => setCam('intensity', Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Environment">
          <select className={sel} value={s.environmentId ?? ''} onChange={(e) => set('environmentId', e.target.value || null)}>
            <option value="">— none —</option>
            {envs.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dialogue in this shot">
          <div className="max-h-32 space-y-1 overflow-y-auto rounded border border-line p-2">
            {lines.map((l) => (
              <label key={l.id} className="flex items-start gap-2">
                <input type="checkbox" checked={s.dialogueLineIds.includes(l.id)} onChange={(e) => set('dialogueLineIds', e.target.checked ? [...s.dialogueLineIds, l.id] : s.dialogueLineIds.filter((x) => x !== l.id))} />
                <span>{l.label}</span>
              </label>
            ))}
          </div>
        </Field>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium text-muted">Characters</span>
            <select
              className={`${sel} w-40`}
              value=""
              onChange={(e) => e.target.value && set('characters', [...s.characters, { characterId: e.target.value, pose: 'idle', expression: 'neutral', x: 0.5, flip: false, enterFrom: 'none', moveToX: null, expressionChange: null }])}
            >
              <option value="">+ add character</option>
              {cast.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {s.characters.map((c, i) => {
            const cc = cast.find((x) => x.id === c.characterId);
            return (
              <div key={i} className="mb-2 grid grid-cols-4 gap-1 rounded border border-line p-2">
                <div className="col-span-4 flex justify-between font-medium">
                  {cc?.name ?? c.characterId}
                  <Button size="sm" variant="ghost" onClick={() => set('characters', s.characters.filter((_, j) => j !== i))}>
                    remove
                  </Button>
                </div>
                <select className={sel} value={c.pose} onChange={(e) => setChar(i, { pose: e.target.value })} title="pose">
                  {(cc?.poses.length ? cc.poses : ['idle']).map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <select className={sel} value={c.expression} onChange={(e) => setChar(i, { expression: e.target.value })} title="expression">
                  {(cc?.faces.length ? cc.faces : ['neutral']).map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <input type="number" step={0.05} className={sel} value={c.x} onChange={(e) => setChar(i, { x: Number(e.target.value) })} title="x position (0..1)" />
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={c.flip} onChange={(e) => setChar(i, { flip: e.target.checked })} />
                  flip
                </label>
                <select className={sel} value={c.enterFrom} onChange={(e) => setChar(i, { enterFrom: e.target.value as ShotCharacter['enterFrom'] })} title="entrance">
                  <option value="none">no entrance</option>
                  <option value="left">enter from left</option>
                  <option value="right">enter from right</option>
                </select>
                <input type="number" step={0.05} placeholder="move to x" className={sel} value={c.moveToX ?? ''} onChange={(e) => setChar(i, { moveToX: e.target.value === '' ? null : Number(e.target.value) })} title="walk/run to x" />
                <select className={sel} value={c.expressionChange?.expression ?? ''} onChange={(e) => setChar(i, { expressionChange: e.target.value ? { at: c.expressionChange?.at ?? 0.5, expression: e.target.value } : null })} title="expression change mid-shot">
                  <option value="">no change</option>
                  {(cc?.faces ?? []).map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
                <input type="number" step={0.1} min={0} max={1} className={sel} value={c.expressionChange?.at ?? 0.5} disabled={!c.expressionChange} onChange={(e) => c.expressionChange && setChar(i, { expressionChange: { ...c.expressionChange, at: Number(e.target.value) } })} title="change at (fraction)" />
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Weather/particles">
            <select className={sel} value={s.effects.weather} onChange={(e) => setFx('weather', e.target.value)}>
              {WEATHER.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Light tint">
            <input className={sel} value={s.effects.tint ?? ''} placeholder="#ff8a3d" onChange={(e) => setFx('tint', e.target.value || null)} />
          </Field>
          <Field label="Tint opacity">
            <input type="number" step={0.05} min={0} max={1} className={sel} value={s.effects.tintOpacity} onChange={(e) => setFx('tintOpacity', Number(e.target.value))} />
          </Field>
          <Field label="Vignette">
            <input type="number" step={0.05} min={0} max={1} className={sel} value={s.effects.vignette} onChange={(e) => setFx('vignette', Number(e.target.value))} />
          </Field>
          <Field label="Impacts (fractions)">
            <input className={sel} value={s.effects.impacts.join(',')} onChange={(e) => setFx('impacts', e.target.value.split(',').map(Number).filter((n) => !Number.isNaN(n) && n >= 0 && n <= 1))} />
          </Field>
          <label className="mt-5 flex items-center gap-1">
            <input type="checkbox" checked={s.effects.speedLines} onChange={(e) => setFx('speedLines', e.target.checked)} /> speed lines
          </label>
        </div>
        <Field label="Sound effects">
          <div className="space-y-1">
            {s.sfx.map((x, i) => (
              <div key={i} className="flex gap-1">
                <select className={sel} value={x.assetId} onChange={(e) => set('sfx', s.sfx.map((y, j) => (j === i ? { ...y, assetId: e.target.value } : y)))}>
                  {sfx.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <input type="number" step={0.05} min={0} max={1} className={`${sel} w-20`} value={x.at} onChange={(e) => set('sfx', s.sfx.map((y, j) => (j === i ? { ...y, at: Number(e.target.value) } : y)))} title="at (fraction)" />
                <Button size="sm" variant="ghost" onClick={() => set('sfx', s.sfx.filter((_, j) => j !== i))}>
                  ✕
                </Button>
              </div>
            ))}
            {sfx.length ? (
              <Button size="sm" onClick={() => set('sfx', [...s.sfx, { assetId: sfx[0].id, at: 0.3, volume: 0.9 }])}>
                + SFX
              </Button>
            ) : null}
          </div>
        </Field>
        <Field label="Image prompt (start frame / still)">
          <textarea className={`${sel} h-16`} value={s.imagePrompt} onChange={(e) => set('imagePrompt', e.target.value)} />
        </Field>
        <Field label="Motion prompt (image→video)">
          <textarea className={`${sel} h-14`} value={s.motionPrompt} onChange={(e) => set('motionPrompt', e.target.value)} />
        </Field>
        <Field label="Negative prompt">
          <input className={sel} value={s.negativePrompt} onChange={(e) => set('negativePrompt', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Image model">
            <select className={sel} value={s.imageModel} onChange={(e) => set('imageModel', e.target.value)}>
              {imageModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Video model">
            <select className={sel} value={s.videoModel} onChange={(e) => set('videoModel', e.target.value)}>
              {videoModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quality">
            <select className={sel} value={s.generation.quality} onChange={(e) => set('generation', { ...s.generation, quality: e.target.value as 'draft' | 'final' })}>
              <option value="draft">draft (cheaper)</option>
              <option value="final">final</option>
            </select>
          </Field>
          <Field label="Mock scenario (testing)">
            <select className={sel} value={s.generation.mockScenario ?? ''} onChange={(e) => set('generation', { ...s.generation, mockScenario: e.target.value || undefined })}>
              {['', 'fail-transient', 'fail-ratelimit', 'fail-invalid', 'fail-ambiguous', 'fail-render', 'expired-media', 'slow'].map((m) => (
                <option key={m} value={m}>
                  {m || 'success'}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setS(structuredClone(shot))}>Reset</Button>
          <ActionButton
            variant="primary"
            action="shot.update"
            success="Shot saved"
            input={() => ({ shotId: shot.id, patch: { purpose: s.purpose, durationSec: s.durationSec, mode: s.mode, transitionIn: s.transitionIn, environmentId: s.environmentId, camera: s.camera, effects: s.effects, characters: s.characters, dialogueLineIds: s.dialogueLineIds, imagePrompt: s.imagePrompt, motionPrompt: s.motionPrompt, negativePrompt: s.negativePrompt, imageModel: s.imageModel, videoModel: s.videoModel, generation: s.generation, sfx: s.sfx } })}
          >
            Save shot
          </ActionButton>
        </div>
      </div>
    </Card>
  );
}
