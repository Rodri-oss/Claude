'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionButton, inputCls } from '@/components/ui';

export function NewEnvironment() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [category, setCat] = useState('general');
  return (
    <div className="flex gap-2">
      <input className={`${inputCls} w-64`} placeholder="New environment name" value={name} onChange={(e) => setName(e.target.value)} />
      <select className={`${inputCls} w-44`} value={category} onChange={(e) => setCat(e.target.value)}>
        {['classroom', 'city', 'bedroom', 'forest', 'night-sky', 'historical', 'fantasy', 'scifi', 'rooftop', 'general'].map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <ActionButton variant="primary" disabled={!name.trim()} action="environment.create" input={() => ({ name, category })} onDone={(id) => router.push(`/environments/${id}`)}>
        Create environment
      </ActionButton>
    </div>
  );
}
