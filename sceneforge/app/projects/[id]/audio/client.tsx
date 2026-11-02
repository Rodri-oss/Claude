'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { rpc } from '@/components/api';
import { ActionButton, UploadButton, inputCls } from '@/components/ui';

export function ImportLine({ projectId, lineId }: { projectId: string; lineId: string }) {
  return <UploadButton size="sm" category="dialogue" projectId={projectId} accept="audio/*" label="Import" onUploaded={(a) => rpc('audio.importLine', { lineId, assetId: a.id })} />;
}

export function NarratorVoice({ projectId, current, models }: { projectId: string; current: { modelId: string; voiceId: string }; models: { id: string; label: string; voices: { id: string; label: string }[] }[] }) {
  const [v, setV] = useState(current);
  const m = models.find((x) => x.id === v.modelId);
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-muted">Narrator</span>
      <select className={`${inputCls} w-44 text-xs`} value={v.modelId} onChange={(e) => setV({ modelId: e.target.value, voiceId: models.find((x) => x.id === e.target.value)?.voices[0]?.id ?? '' })}>
        {models.map((x) => (
          <option key={x.id} value={x.id}>
            {x.label}
          </option>
        ))}
      </select>
      <select className={`${inputCls} w-36 text-xs`} value={v.voiceId} onChange={(e) => setV({ ...v, voiceId: e.target.value })}>
        {(m?.voices ?? []).map((x) => (
          <option key={x.id} value={x.id}>
            {x.label}
          </option>
        ))}
      </select>
      {v.modelId !== current.modelId || v.voiceId !== current.voiceId ? (
        <ActionButton size="sm" action="audio.setNarratorVoice" input={() => ({ projectId, ...v })}>
          Set
        </ActionButton>
      ) : null}
    </div>
  );
}

export function SceneAudio({ sceneId, music, ambience, musicOptions, ambienceOptions }: { sceneId: string; music: string; ambience: string; musicOptions: { id: string; name: string }[]; ambienceOptions: { id: string; name: string }[] }) {
  const [m, setM] = useState(music);
  const [a, setA] = useState(ambience);
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-muted">Music</span>
      <select className={`${inputCls} w-40 text-xs`} value={m} onChange={(e) => setM(e.target.value)}>
        <option value="">project default</option>
        {musicOptions.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <span className="text-muted">Ambience</span>
      <select className={`${inputCls} w-40 text-xs`} value={a} onChange={(e) => setA(e.target.value)}>
        <option value="">project default</option>
        {ambienceOptions.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      {m !== music || a !== ambience ? (
        <ActionButton size="sm" action="scene.setAudio" input={() => ({ sceneId, music: m, ambience: a })}>
          Set
        </ActionButton>
      ) : null}
    </div>
  );
}

/** Refreshes the page while this project has active jobs, so worker progress shows up. */
export function JobsPoller({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  useEffect(() => {
    let stop = false;
    let prev = -1;
    const tick = async () => {
      try {
        const jobs = await rpc<{ state: string }[]>('jobs.list', { projectId, limit: 200 });
        const n = jobs.filter((j) => ['QUEUED', 'SUBMITTED', 'RUNNING'].includes(j.state)).length;
        setActive(n);
        if (n !== prev && prev !== -1) router.refresh();
        prev = n;
      } catch {}
      if (!stop) setTimeout(tick, 2000);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [projectId, router]);
  return active ? <div className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">{active} job(s) running in the worker… (start it with `npm run worker` if nothing progresses)</div> : null;
}
