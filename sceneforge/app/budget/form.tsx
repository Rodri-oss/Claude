'use client';
import { useState } from 'react';
import { ActionButton, Card, Field, inputCls } from '@/components/ui';

type S = { monthlyLimitUsd: number; allocations: Record<string, number>; warnThreshold: number; defaultProjectLimitUsd: number; perSceneLimitUsd: number; perShotLimitUsd: number; maxGenerationsPerShot: number; maxBatchUsd: number; reserveUsd: number; killSwitch: boolean; countSimulated: boolean };

export function BudgetForm({ settings }: { settings: S }) {
  const [f, setF] = useState({ ...settings, allocations: Object.fromEntries(Object.entries(settings.allocations).map(([k, v]) => [k, Math.round(v * 100)])) });
  const num = (k: keyof S, label: string, hint?: string, step = 1) => (
    <Field label={label} hint={hint}>
      <input type="number" step={step} className={inputCls} value={f[k] as number} onChange={(e) => setF({ ...f, [k]: Number(e.target.value) })} />
    </Field>
  );
  const allocSum = Object.values(f.allocations).reduce((a, b) => a + b, 0);
  return (
    <Card
      title="Budget policies"
      actions={
        <ActionButton
          variant="primary"
          size="sm"
          action="budget.update"
          success="Budget settings saved"
          input={() => ({ ...f, allocations: Object.fromEntries(Object.entries(f.allocations).map(([k, v]) => [k, v / 100])) })}
        >
          Save
        </ActionButton>
      }
    >
      <div className="grid grid-cols-5 gap-3 text-xs">
        {num('monthlyLimitUsd', 'Monthly hard limit ($150–400)')}
        {num('defaultProjectLimitUsd', 'Default per-project budget')}
        {num('perSceneLimitUsd', 'Per-scene limit')}
        {num('perShotLimitUsd', 'Per-shot $ limit')}
        {num('maxGenerationsPerShot', 'Max paid generations per shot')}
        {num('maxBatchUsd', 'Max approved batch amount')}
        {num('reserveUsd', 'Revision reserve', 'Held back from first-pass jobs; only revisions may use it')}
        {num('warnThreshold', 'Warning threshold (0–1)', undefined, 0.05)}
        <label className="mt-5 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.killSwitch} onChange={(e) => setF({ ...f, killSwitch: e.target.checked })} />
          <span className={f.killSwitch ? 'text-red-300' : ''}>Paid-job kill switch</span>
        </label>
        <label className="mt-5 flex items-center gap-2">
          <input type="checkbox" checked={f.countSimulated} onChange={(e) => setF({ ...f, countSimulated: e.target.checked })} /> Count simulated (mock) cost toward caps
        </label>
      </div>
      <div className="mt-3 grid grid-cols-6 gap-3 text-xs">
        {Object.keys(f.allocations).map((k) => (
          <Field key={k} label={`${k} %`}>
            <input type="number" className={inputCls} value={f.allocations[k]} onChange={(e) => setF({ ...f, allocations: { ...f.allocations, [k]: Number(e.target.value) } })} />
          </Field>
        ))}
        <div className={`mt-5 ${allocSum === 100 ? 'text-muted' : 'text-red-300'}`}>Total {allocSum}% (must be 100)</div>
      </div>
    </Card>
  );
}
