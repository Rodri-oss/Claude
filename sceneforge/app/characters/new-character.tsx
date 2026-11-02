'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionButton, inputCls } from '@/components/ui';

export function NewCharacter({ series }: { series: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [seriesId, setSeries] = useState('');
  return (
    <div className="flex gap-2">
      <input className={`${inputCls} w-64`} placeholder="New character name" value={name} onChange={(e) => setName(e.target.value)} />
      <select className={`${inputCls} w-48`} value={seriesId} onChange={(e) => setSeries(e.target.value)}>
        <option value="">no series</option>
        {series.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <ActionButton variant="primary" disabled={!name.trim()} action="character.create" input={() => ({ name, seriesId: seriesId || null })} onDone={(c) => router.push(`/characters/${(c as { id: string }).id}`)}>
        Create character
      </ActionButton>
    </div>
  );
}
