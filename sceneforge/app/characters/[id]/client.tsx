'use client';
import { useEffect, useState } from 'react';
import { rpc } from '@/components/api';
import { ActionButton, Card, Field, inputCls, UploadButton } from '@/components/ui';

type C = { id: string; name: string; description: string; personality: string; palette: string[]; proportions: string; identifyingDetails: string; seriesId: string | null; voiceProvider: string; voiceId: string; voiceSettings: { speed?: number; pitch?: number; style?: string }; locked: boolean };

export function CharacterForm({ character, series, ttsModels }: { character: C; series: { id: string; name: string }[]; ttsModels: { id: string; label: string; voices: { id: string; label: string }[] }[] }) {
  const [f, setF] = useState({ ...character, palette: character.palette.join(' ') });
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const model = f.voiceProvider === 'auto' ? ttsModels[0] : ttsModels.find((m) => m.id === f.voiceProvider);
  const d = character.locked;
  return (
    <Card
      title="Design & voice"
      actions={
        <ActionButton
          variant="primary"
          size="sm"
          action="character.update"
          success="Saved"
          input={() => {
            const patch: Record<string, unknown> = { name: f.name, personality: f.personality, seriesId: f.seriesId || null, voiceProvider: f.voiceProvider, voiceId: f.voiceId, voiceSettings: f.voiceSettings };
            if (!d) Object.assign(patch, { description: f.description, proportions: f.proportions, identifyingDetails: f.identifyingDetails, palette: f.palette.split(/[\s,]+/).filter(Boolean) });
            return { characterId: character.id, patch };
          }}
        >
          Save
        </ActionButton>
      }
    >
      <div className="grid grid-cols-2 gap-3 text-xs">
        <Field label="Name">
          <input className={inputCls} value={f.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Series">
          <select className={inputCls} value={f.seriesId ?? ''} onChange={(e) => set('seriesId', e.target.value)}>
            <option value="">none</option>
            {series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="col-span-2">
          <Field label={`Description${d ? ' (locked)' : ''}`}>
            <textarea disabled={d} className={`${inputCls} h-16`} value={f.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
        </div>
        <Field label="Personality">
          <input className={inputCls} value={f.personality} onChange={(e) => set('personality', e.target.value)} />
        </Field>
        <Field label="Palette (hex)">
          <div className="flex items-center gap-2">
            <input disabled={d} className={inputCls} value={f.palette} onChange={(e) => set('palette', e.target.value)} />
            {f.palette
              .split(/[\s,]+/)
              .filter(Boolean)
              .map((c) => (
                <span key={c} className="h-5 w-5 shrink-0 rounded border border-line" style={{ background: c }} />
              ))}
          </div>
        </Field>
        <Field label="Proportions">
          <input disabled={d} className={inputCls} value={f.proportions} onChange={(e) => set('proportions', e.target.value)} />
        </Field>
        <Field label="Hair / identifying details">
          <input disabled={d} className={inputCls} value={f.identifyingDetails} onChange={(e) => set('identifyingDetails', e.target.value)} />
        </Field>
        <Field label="Voice provider/model">
          <select className={inputCls} value={f.voiceProvider} onChange={(e) => set('voiceProvider', e.target.value)}>
            <option value="auto">auto (best free voice available)</option>
            {ttsModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Voice">
          <select className={inputCls} value={f.voiceId} onChange={(e) => set('voiceId', e.target.value)}>
            <option value="">default</option>
            {(model?.voices ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
            {f.voiceId && !(model?.voices ?? []).some((v) => v.id === f.voiceId) ? <option value={f.voiceId}>{f.voiceId}</option> : null}
          </select>
        </Field>
        <Field label="Delivery speed">
          <input type="number" step={0.05} min={0.5} max={2} className={inputCls} value={f.voiceSettings.speed ?? 1} onChange={(e) => set('voiceSettings', { ...f.voiceSettings, speed: Number(e.target.value) })} />
        </Field>
        <Field label="Pitch">
          <input type="number" step={0.05} min={0.5} max={2} className={inputCls} value={f.voiceSettings.pitch ?? 1} onChange={(e) => set('voiceSettings', { ...f.voiceSettings, pitch: Number(e.target.value) })} />
        </Field>
      </div>
    </Card>
  );
}

export function VariantUpload({ characterId }: { characterId: string }) {
  const [kind, setKind] = useState('reference');
  const [name, setName] = useState('front');
  return (
    <div className="flex items-center gap-1">
      <select className={`${inputCls} w-28 text-xs`} value={kind} onChange={(e) => setKind(e.target.value)}>
        {['view', 'fullbody', 'sheet', 'reference', 'outfit', 'pose', 'expression', 'eyes', 'mouth'].map((k) => (
          <option key={k}>{k}</option>
        ))}
      </select>
      <input className={`${inputCls} w-28 text-xs`} placeholder="name (e.g. side, happy, open)" value={name} onChange={(e) => setName(e.target.value)} />
      <UploadButton size="sm" category="character" accept="image/png,image/webp,image/jpeg" label="Upload art" onUploaded={(a) => rpc('character.addVariant', { characterId, kind, name: name || kind, assetId: a.id })} />
    </div>
  );
}

export function ContinuityItem({ characterId, item, checked, disabled }: { characterId: string; item: string; checked: boolean; disabled: boolean }) {
  return (
    <ActionButton size="sm" variant="ghost" disabled={disabled} action="character.continuity" input={{ characterId, item, checked: !checked }} className="w-full justify-start">
      <span className={checked ? 'text-emerald-300' : 'text-muted'}>{checked ? '☑' : '☐'}</span> {item}
    </ActionButton>
  );
}

export function RigPreview({ rig }: { rig: { poses: Record<string, string>; faces: Record<string, string>; eyesClosed: string | null; mouths: string[] | null } }) {
  const [pose, setPose] = useState(Object.keys(rig.poses)[0]);
  const [face, setFace] = useState(Object.keys(rig.faces)[0] ?? '');
  const [talk, setTalk] = useState(true);
  const [t, setT] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setT((x) => x + 1), 1000 / 12);
    return () => clearInterval(i);
  }, []);
  const blink = rig.eyesClosed && t % 40 < 2;
  const mouth = rig.mouths ? rig.mouths[talk ? [0, 1, 2, 1, 0, 1, 1, 2, 0, 0][t % 10] : 0] : null;
  const L = 'absolute inset-0 h-full w-full';
  return (
    <div>
      <div className="relative mx-auto h-72 w-36 rounded bg-[#e9e4da]" style={{ transform: `scaleY(${1 + 0.008 * Math.sin(t / 4)})`, transformOrigin: 'bottom' }}>
        <img src={rig.poses[pose]} alt="" className={L} />
        {face ? <img src={rig.faces[face]} alt="" className={L} /> : null}
        {blink ? <img src={rig.eyesClosed!} alt="" className={L} /> : null}
        {mouth ? <img src={mouth} alt="" className={L} /> : null}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <select className={inputCls} value={pose} onChange={(e) => setPose(e.target.value)}>
          {Object.keys(rig.poses).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select className={inputCls} value={face} onChange={(e) => setFace(e.target.value)}>
          {Object.keys(rig.faces).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <label className="col-span-2 flex items-center gap-1 text-muted">
          <input type="checkbox" checked={talk} onChange={(e) => setTalk(e.target.checked)} /> mouth flap demo (blink + breathing always on)
        </label>
      </div>
    </div>
  );
}
