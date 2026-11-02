'use client';
import { useState } from 'react';
import { ActionButton, inputCls } from '@/components/ui';

export function AddCastMember({ projectId, options }: { projectId: string; options: { id: string; name: string }[] }) {
  const [sel, setSel] = useState(options[0]?.id ?? '');
  if (!options.length) return <span className="text-xs text-muted">All library characters are in the cast</span>;
  return (
    <div className="flex gap-2">
      <select className={`${inputCls} w-48 text-xs`} value={sel} onChange={(e) => setSel(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <ActionButton size="sm" action="character.addToProject" input={() => ({ projectId, characterId: sel })}>
        Add to cast
      </ActionButton>
    </div>
  );
}

export function SceneEnvSelect({ sceneId, value, options }: { sceneId: string; value: string | null; options: { id: string; name: string }[] }) {
  const [v, setV] = useState(value ?? '');
  return (
    <div className="flex gap-2">
      <select className={`${inputCls} text-xs`} value={v} onChange={(e) => setV(e.target.value)}>
        <option value="">— none —</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {v !== (value ?? '') ? (
        <ActionButton size="sm" variant="primary" action="scene.assignEnvironment" input={() => ({ sceneId, environmentId: v || null })}>
          Set
        </ActionButton>
      ) : null}
    </div>
  );
}
