'use client';
import { useState } from 'react';
import { rpc } from '@/components/api';
import { ActionButton, Card, Field, inputCls, UploadButton } from '@/components/ui';

export function LayerUpload({ environmentId }: { environmentId: string }) {
  const [role, setRole] = useState('background');
  const [review, setReview] = useState(false);
  return (
    <div className="flex items-center gap-1 text-xs">
      <select className={`${inputCls} w-32 text-xs`} value={role} onChange={(e) => setRole(e.target.value)}>
        {['background', 'midground', 'foreground', 'overlay'].map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-muted">
        <input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} /> from segmentation
      </label>
      <UploadButton size="sm" category="background" accept="image/png,image/webp,image/jpeg" label="Upload layer" onUploaded={(a) => rpc('environment.addLayer', { environmentId, assetId: a.id, role, needsReview: review })} />
    </div>
  );
}

export function LayerParallax({ layerId, value, disabled }: { layerId: string; value: number; disabled: boolean }) {
  const [v, setV] = useState(value);
  return (
    <span className="flex items-center gap-1">
      parallax
      <input disabled={disabled} type="number" step={0.05} min={0} max={3} className={`${inputCls} w-20 text-xs`} value={v} onChange={(e) => setV(Number(e.target.value))} />
      {v !== value ? (
        <ActionButton size="sm" action="environment.updateLayer" input={() => ({ layerId, parallax: v })}>
          Set
        </ActionButton>
      ) : null}
    </span>
  );
}

export function LightingVariant({ environmentId, name }: { environmentId: string; name: string }) {
  const [f, setF] = useState({ name: `${name} (Night)`, timeOfDay: 'night', tint: '#1d2a6b', tintOpacity: 0.45 });
  return (
    <Card title="New day/night variant">
      <div className="space-y-2 text-xs">
        <input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="grid grid-cols-3 gap-1">
          <select className={inputCls} value={f.timeOfDay} onChange={(e) => setF({ ...f, timeOfDay: e.target.value })}>
            {['day', 'sunset', 'night', 'dawn', 'interior'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <input type="color" className="h-8 w-full rounded" value={f.tint} onChange={(e) => setF({ ...f, tint: e.target.value })} />
          <input type="number" min={0} max={1} step={0.05} className={inputCls} value={f.tintOpacity} onChange={(e) => setF({ ...f, tintOpacity: Number(e.target.value) })} />
        </div>
        <ActionButton size="sm" action="environment.lightingVariant" input={() => ({ environmentId, ...f })} success="Variant created (shares layers)">
          Create variant
        </ActionButton>
      </div>
    </Card>
  );
}

export function EnvSettings({ env }: { env: { id: string; name: string; description: string; category: string; timeOfDay: string; backgroundColor: string; lighting: { tint: string | null; tintOpacity: number; ambience?: string }; locked: boolean } }) {
  const [f, setF] = useState(env);
  const d = env.locked;
  return (
    <Card title="Settings" actions={!d ? <ActionButton size="sm" variant="primary" action="environment.update" input={() => ({ environmentId: env.id, patch: { name: f.name, description: f.description, category: f.category, timeOfDay: f.timeOfDay, backgroundColor: f.backgroundColor, lighting: f.lighting } })}>Save</ActionButton> : null}>
      <div className="space-y-2 text-xs">
        <Field label="Name">
          <input disabled={d} className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Description">
          <textarea disabled={d} className={inputCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="Default particles / weather (used by the shot planner)">
          <select disabled={d} className={inputCls} value={f.lighting.ambience ?? 'none'} onChange={(e) => setF({ ...f, lighting: { ...f.lighting, ambience: e.target.value } })}>
            {['none', 'rain', 'snow', 'dust', 'fireflies', 'sparkles', 'embers'].map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-1">
          <Field label="Base colour">
            <input disabled={d} type="color" className="h-8 w-full" value={f.backgroundColor} onChange={(e) => setF({ ...f, backgroundColor: e.target.value })} />
          </Field>
          <Field label="Light tint">
            <input disabled={d} type="color" className="h-8 w-full" value={f.lighting.tint ?? '#000000'} onChange={(e) => setF({ ...f, lighting: { ...f.lighting, tint: e.target.value } })} />
          </Field>
          <Field label="Tint opacity">
            <input disabled={d} type="number" min={0} max={1} step={0.05} className={inputCls} value={f.lighting.tintOpacity} onChange={(e) => setF({ ...f, lighting: { ...f.lighting, tintOpacity: Number(e.target.value) } })} />
          </Field>
        </div>
      </div>
    </Card>
  );
}
