'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { rpc, toast } from '@/components/api';
import { Button, Card, Field, inputCls, Spinner } from '@/components/ui';

export function NewProjectForm({ presets, series, templates, initialTemplate, initialSeries }: { presets: { id: string; name: string; description: string; style: string }[]; series: { id: string; name: string }[]; templates: { id: string; title: string; preset: string }[]; initialTemplate?: string; initialSeries?: string }) {
  const router = useRouter();
  const tpl = templates.find((t) => t.id === initialTemplate);
  const [f, setF] = useState({ title: '', presetId: tpl?.preset ?? 'adventure', aspect: '16:9', targetDurationSec: 120, budgetLimitUsd: 80, seriesId: initialSeries ?? '', sourceKind: 'idea', sourceInput: '', templateProjectId: tpl?.id ?? '' });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const preset = presets.find((p) => p.id === f.presetId);
  return (
    <Card>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Title">
          <input className={inputCls} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="My original cartoon" />
        </Field>
        <Field label="Genre preset" hint={preset?.description}>
          <select className={inputCls} value={f.presetId} onChange={(e) => set('presetId', e.target.value)}>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Format">
          <select className={inputCls} value={f.aspect} onChange={(e) => set('aspect', e.target.value)}>
            <option value="16:9">16:9 — 1920×1080</option>
            <option value="9:16">9:16 — 1080×1920</option>
          </select>
        </Field>
        <Field label={`Target runtime: ${f.targetDurationSec}s`} hint="120–300 seconds">
          <input type="range" min={120} max={300} step={10} value={f.targetDurationSec} onChange={(e) => set('targetDurationSec', Number(e.target.value))} className="w-full accent-[#ff9f43]" />
        </Field>
        <Field label="Project budget (USD)" hint="Hard cap for this project's paid generation">
          <input type="number" min={0} max={400} className={inputCls} value={f.budgetLimitUsd} onChange={(e) => set('budgetLimitUsd', Number(e.target.value))} />
        </Field>
        <Field label="Series (optional)">
          <select className={inputCls} value={f.seriesId} onChange={(e) => set('seriesId', e.target.value)}>
            <option value="">— none —</option>
            {series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        {templates.length ? (
          <Field label="Start from template (copies cast)">
            <select className={inputCls} value={f.templateProjectId} onChange={(e) => set('templateProjectId', e.target.value)}>
              <option value="">— none —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Input type">
          <select className={inputCls} value={f.sourceKind} onChange={(e) => set('sourceKind', e.target.value)}>
            <option value="idea">Idea / detailed prompt</option>
            <option value="outline">Outline</option>
            <option value="script">Complete script</option>
          </select>
        </Field>
        <div className="col-span-2">
          <Field label={f.sourceKind === 'script' ? 'Script (see format help on the Story tab)' : 'Story idea or outline'}>
            <textarea className={`${inputCls} h-48 font-mono text-xs`} value={f.sourceInput} onChange={(e) => set('sourceInput', e.target.value)} placeholder={f.sourceKind === 'script' ? 'TITLE: …\nSCENE: Opening @ Rooftop\nAKI (excited): Look at that!' : 'A shy robot gardener discovers the last seed on a frozen planet…'} />
          </Field>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input
              type="file"
              accept=".txt,.md,.fountain"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2_000_000) return toast('Script file too large (2 MB max)', 'error');
                set('sourceInput', await file.text());
                set('sourceKind', 'script');
              }}
            />
            <span className="rounded border border-line px-2 py-1 hover:border-accent">Load script/reference file (.txt, .md, .fountain)</span>
          </label>
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button
          variant="primary"
          disabled={busy || !f.title.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              const p = await rpc<{ id: string }>('project.create', { ...f, seriesId: f.seriesId || null, templateProjectId: f.templateProjectId || undefined });
              if (f.sourceInput.trim()) {
                try {
                  if (f.sourceKind === 'script') await rpc('story.applyScript', { projectId: p.id, script: f.sourceInput });
                  else await rpc('story.generate', { projectId: p.id, idea: f.sourceInput });
                } catch (e) {
                  toast(`Project created, but story input failed: ${(e as Error).message}`, 'error');
                }
              }
              router.push(`/projects/${p.id}/story`);
            } catch (e) {
              toast((e as Error).message, 'error');
              setBusy(false);
            }
          }}
        >
          {busy ? <Spinner /> : null}Create project
        </Button>
      </div>
    </Card>
  );
}
