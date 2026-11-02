'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionButton, Card, Field, inputCls } from '@/components/ui';

type P = { id: string; title: string; targetDurationSec: number; aspect: string; fps: number; mix: { A: number; B: number; C: number }; budgetLimitUsd: number; productionStyle: string; isTemplate: boolean; audience: string };

export function ProjectSettings({ project }: { project: P }) {
  const router = useRouter();
  const [f, setF] = useState({ ...project, mix: { A: Math.round(project.mix.A * 100), B: Math.round(project.mix.B * 100), C: Math.round(project.mix.C * 100) } });
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  return (
    <Card title="Project settings">
      <div className="space-y-3">
        <Field label="Title">
          <input className={inputCls} value={f.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Audience">
          <input className={inputCls} value={f.audience} onChange={(e) => set('audience', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Target runtime (s)">
            <input type="number" min={120} max={300} className={inputCls} value={f.targetDurationSec} onChange={(e) => set('targetDurationSec', Number(e.target.value))} />
          </Field>
          <Field label="Format">
            <select className={inputCls} value={f.aspect} onChange={(e) => set('aspect', e.target.value)}>
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
            </select>
          </Field>
          <Field label="FPS">
            <input type="number" min={12} max={60} className={inputCls} value={f.fps} onChange={(e) => set('fps', Number(e.target.value))} />
          </Field>
          <Field label="Budget cap ($)">
            <input type="number" min={0} max={400} className={inputCls} value={f.budgetLimitUsd} onChange={(e) => set('budgetLimitUsd', Number(e.target.value))} />
          </Field>
        </div>
        <Field label="Production style">
          <select className={inputCls} value={f.productionStyle} onChange={(e) => set('productionStyle', e.target.value)}>
            <option value="dialogue-first">Dialogue-first (character scenes)</option>
            <option value="narration-first">Narration-first (educational/historical)</option>
          </select>
        </Field>
        <Field label="Animation mode mix A / B / C (%)" hint="A limited 2D · B AI image-to-video · C stills. Used by the shot planner.">
          <div className="grid grid-cols-3 gap-2">
            {(['A', 'B', 'C'] as const).map((k) => (
              <input key={k} type="number" min={0} max={100} className={inputCls} value={f.mix[k]} onChange={(e) => set('mix', { ...f.mix, [k]: Number(e.target.value) })} />
            ))}
          </div>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.isTemplate} onChange={(e) => set('isTemplate', e.target.checked)} /> Use as project template
        </label>
        <div className="flex justify-between">
          <ActionButton variant="danger" size="sm" action="project.delete" input={{ projectId: project.id }} confirm="Delete this project and its data? Shared library assets are kept." refresh={false} onDone={() => router.push('/')}>
            Delete
          </ActionButton>
          <ActionButton
            variant="primary"
            action="project.update"
            success="Saved"
            input={() => ({ projectId: project.id, patch: { title: f.title, audience: f.audience, targetDurationSec: f.targetDurationSec, aspect: f.aspect, fps: f.fps, budgetLimitUsd: f.budgetLimitUsd, productionStyle: f.productionStyle, isTemplate: f.isTemplate, mix: { A: f.mix.A / 100, B: f.mix.B / 100, C: f.mix.C / 100 } } })}
          >
            Save
          </ActionButton>
        </div>
      </div>
    </Card>
  );
}
