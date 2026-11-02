'use client';
import { useState } from 'react';
import { ActionButton, inputCls } from '@/components/ui';

export function NewSeries() {
  const [name, setName] = useState('');
  const [description, setD] = useState('');
  return (
    <div className="flex gap-2">
      <input className={`${inputCls} w-64`} placeholder="Series name" value={name} onChange={(e) => setName(e.target.value)} />
      <input className={inputCls} placeholder="Description" value={description} onChange={(e) => setD(e.target.value)} />
      <ActionButton variant="primary" disabled={!name.trim()} action="series.create" input={() => ({ name, description })} onDone={() => setName('')}>
        Create series
      </ActionButton>
    </div>
  );
}
