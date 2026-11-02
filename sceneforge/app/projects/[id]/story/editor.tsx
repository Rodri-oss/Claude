'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { rpc } from '@/components/api';
import { ActionButton, Badge, Button, Card, Field, fmtSec, inputCls } from '@/components/ui';

type Line = { id: string; speakerName: string; text: string; emotion: string; speed: number; seq: number; pronunciation: Record<string, string> };
type Scene = { id: string; seq: number; title: string; description: string; locationName: string; tone: string; beatStart: string; beatEnd: string; actions: string[]; estDurationSec: number; lines: Line[] };
type Bible = { artStyle: string; palette: string[]; lineWork: string; lighting: string; cameraLanguage: string; notes: string; locked: boolean } | null;

const EMOTIONS = ['neutral', 'calm', 'happy', 'excited', 'determined', 'angry', 'shouting', 'sad', 'worried', 'surprised', 'whisper'];

export function StoryEditor({ projectId, project, presets, scenes, estimatedRuntimeSec, speakers, styleBible }: { projectId: string; project: { title: string; preset: string; presetName: string; targetDurationSec: number; sourceInput: string; logline: string }; presets: { id: string; name: string }[]; scenes: Scene[]; estimatedRuntimeSec: number; speakers: string[]; styleBible: Bible }) {
  const router = useRouter();
  const [idea, setIdea] = useState(project.sourceInput);
  const [preset, setPreset] = useState(project.preset);
  const [script, setScript] = useState<string | null>(null);
  const delta = estimatedRuntimeSec - project.targetDurationSec;
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="col-span-2 space-y-4">
        <Card
          title="Scene breakdown"
          actions={
            <>
              <span className="text-xs text-muted">
                Estimated {fmtSec(estimatedRuntimeSec)} vs target {fmtSec(project.targetDurationSec)}{' '}
                <Badge tone={Math.abs(delta) / project.targetDurationSec < 0.15 ? 'approved' : 'stale'}>
                  {delta >= 0 ? '+' : ''}
                  {Math.round(delta)}s
                </Badge>
              </span>
              <ActionButton size="sm" action="scene.add" input={{ projectId, title: `Scene ${scenes.length + 1}` }}>
                + Scene
              </ActionButton>
            </>
          }
        >
          {scenes.length === 0 ? <div className="text-sm text-muted">No scenes yet. Generate a draft from an idea or paste a script →</div> : null}
          <div className="space-y-4">
            {scenes.map((s, i) => (
              <SceneCard key={s.id} projectId={projectId} scene={s} first={i === 0} last={i === scenes.length - 1} speakers={speakers} />
            ))}
          </div>
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Idea → draft">
          <div className="space-y-2">
            <Field label="Story idea / outline">
              <textarea className={`${inputCls} h-28`} value={idea} onChange={(e) => setIdea(e.target.value)} />
            </Field>
            <Field label="Structure preset">
              <select className={inputCls} value={preset} onChange={(e) => setPreset(e.target.value)}>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-[11px] text-muted">Uses the built-in template generator (no AI key needed). It produces an editable structural draft — rewrite the dialogue. LLM drafting is a Phase 2 adapter.</p>
            <ActionButton variant="primary" action="story.generate" input={() => ({ projectId, idea, presetId: preset })} confirm={scenes.length ? 'Replace the current scenes and dialogue with a new draft?' : undefined} success="Draft generated">
              Generate draft
            </ActionButton>
          </div>
        </Card>
        <Card
          title="Script editor"
          actions={
            <Button size="sm" onClick={async () => setScript((await rpc<{ script: string }>('story.exportScript', { projectId })).script || SCRIPT_HELP)}>
              {script === null ? 'Open' : 'Reload'}
            </Button>
          }
        >
          {script === null ? (
            <p className="text-xs text-muted">Edit the whole story as plain text (also accepts pasted or uploaded scripts). Applying replaces scenes &amp; dialogue; any story approval becomes stale.</p>
          ) : (
            <div className="space-y-2">
              <textarea className={`${inputCls} h-96 font-mono text-[11px]`} value={script} onChange={(e) => setScript(e.target.value)} />
              <div className="flex justify-between">
                <label className="cursor-pointer text-xs text-muted hover:text-fg">
                  <input type="file" accept=".txt,.md,.fountain" className="hidden" onChange={async (e) => e.target.files?.[0] && setScript(await e.target.files[0].text())} />
                  Load file…
                </label>
                <ActionButton variant="primary" size="sm" action="story.applyScript" input={() => ({ projectId, script })} confirm="Apply script? This replaces all scenes, dialogue and planned shots." success="Script applied" onDone={() => router.refresh()}>
                  Apply script
                </ActionButton>
              </div>
            </div>
          )}
        </Card>
        <StyleBibleCard projectId={projectId} bible={styleBible} />
      </div>
    </div>
  );
}

const SCRIPT_HELP = `TITLE: My Story
LOGLINE: One sentence.
CHARACTER: Aki | description | personality
LOCATION: Rooftop | description

SCENE: Opening @ Rooftop [tone: hopeful]
Scene description line.
> An action line (runs, fights and chases become action shots).
AKI (excited): Dialogue line.
NARRATOR: Narration line.
`;

function SceneCard({ projectId, scene, first, last, speakers }: { projectId: string; scene: Scene; first: boolean; last: boolean; speakers: string[] }) {
  const [f, setF] = useState({ title: scene.title, description: scene.description, locationName: scene.locationName, tone: scene.tone, beatStart: scene.beatStart, beatEnd: scene.beatEnd, actions: scene.actions.join('\n') });
  const [newLine, setNewLine] = useState({ speakerName: speakers[1] ?? 'NARRATOR', emotion: 'neutral', text: '' });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div className="rounded-md border border-line bg-panel2/40">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Scene {scene.seq}</span>
          <input className="rounded bg-transparent px-1 text-sm font-semibold outline-none focus:bg-panel2" value={f.title} onChange={(e) => set('title', e.target.value)} />
          <Badge>~{fmtSec(scene.estDurationSec)}</Badge>
        </div>
        <div className="flex gap-1">
          <ActionButton size="sm" variant="ghost" disabled={first} action="scene.move" input={{ projectId, sceneId: scene.id, direction: -1 }}>
            ↑
          </ActionButton>
          <ActionButton size="sm" variant="ghost" disabled={last} action="scene.move" input={{ projectId, sceneId: scene.id, direction: 1 }}>
            ↓
          </ActionButton>
          <ActionButton size="sm" variant="ghost" action="scene.delete" input={{ sceneId: scene.id }} confirm="Delete this scene and its dialogue and shots?">
            Delete
          </ActionButton>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 p-3">
        <div className="col-span-4">
          <textarea className={`${inputCls} h-14 text-xs`} placeholder="Description" value={f.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <input className={`${inputCls} text-xs`} placeholder="Location" value={f.locationName} onChange={(e) => set('locationName', e.target.value)} />
        <input className={`${inputCls} text-xs`} placeholder="Tone" value={f.tone} onChange={(e) => set('tone', e.target.value)} />
        <input className={`${inputCls} text-xs`} placeholder="Start beat" value={f.beatStart} onChange={(e) => set('beatStart', e.target.value)} />
        <input className={`${inputCls} text-xs`} placeholder="End beat" value={f.beatEnd} onChange={(e) => set('beatEnd', e.target.value)} />
        <div className="col-span-3">
          <textarea className={`${inputCls} h-12 text-xs`} placeholder="Action lines (one per line)" value={f.actions} onChange={(e) => set('actions', e.target.value)} />
        </div>
        <div className="flex items-end justify-end">
          <ActionButton size="sm" action="scene.update" input={() => ({ sceneId: scene.id, patch: { ...f, actions: f.actions.split('\n').map((x) => x.trim()).filter(Boolean) } })} success="Scene saved">
            Save scene
          </ActionButton>
        </div>
      </div>
      <div className="space-y-1 px-3 pb-3">
        {scene.lines.map((l, i) => (
          <LineRow key={l.id} line={l} speakers={speakers} sceneId={scene.id} first={i === 0} last={i === scene.lines.length - 1} />
        ))}
        <div className="flex gap-2 pt-1">
          <select className={`${inputCls} w-36 text-xs`} value={newLine.speakerName} onChange={(e) => setNewLine({ ...newLine, speakerName: e.target.value })}>
            {speakers.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select className={`${inputCls} w-28 text-xs`} value={newLine.emotion} onChange={(e) => setNewLine({ ...newLine, emotion: e.target.value })}>
            {EMOTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <input className={`${inputCls} text-xs`} placeholder="New line…" value={newLine.text} onChange={(e) => setNewLine({ ...newLine, text: e.target.value })} />
          <ActionButton
            size="sm"
            action="line.upsert"
            disabled={!newLine.text.trim()}
            input={() => ({ sceneId: scene.id, ...newLine })}
            onDone={() => setNewLine({ ...newLine, text: '' })}
          >
            Add
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function LineRow({ line, speakers, sceneId, first, last }: { line: Line; speakers: string[]; sceneId: string; first: boolean; last: boolean }) {
  const [f, setF] = useState({ speakerName: line.speakerName, emotion: line.emotion, text: line.text, speed: line.speed });
  const dirty = f.text !== line.text || f.emotion !== line.emotion || f.speakerName !== line.speakerName || f.speed !== line.speed;
  const opts = speakers.includes(f.speakerName) ? speakers : [...speakers, f.speakerName];
  return (
    <div className="flex items-center gap-2">
      <select className={`${inputCls} w-36 text-xs`} value={f.speakerName} onChange={(e) => setF({ ...f, speakerName: e.target.value })}>
        {opts.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <select className={`${inputCls} w-28 text-xs`} value={f.emotion} onChange={(e) => setF({ ...f, emotion: e.target.value })}>
        {(EMOTIONS.includes(f.emotion) ? EMOTIONS : [...EMOTIONS, f.emotion]).map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      <input className={`${inputCls} text-xs`} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
      <input type="number" step={0.05} min={0.5} max={2} title="Delivery speed" className={`${inputCls} w-16 text-xs`} value={f.speed} onChange={(e) => setF({ ...f, speed: Number(e.target.value) })} />
      {dirty ? (
        <ActionButton size="sm" variant="primary" action="line.upsert" input={() => ({ id: line.id, sceneId, ...f, pronunciation: line.pronunciation })}>
          Save
        </ActionButton>
      ) : null}
      <ActionButton size="sm" variant="ghost" disabled={first} action="line.move" input={{ lineId: line.id, direction: -1 }}>
        ↑
      </ActionButton>
      <ActionButton size="sm" variant="ghost" disabled={last} action="line.move" input={{ lineId: line.id, direction: 1 }}>
        ↓
      </ActionButton>
      <ActionButton size="sm" variant="ghost" action="line.delete" input={{ lineId: line.id }}>
        ✕
      </ActionButton>
    </div>
  );
}

function StyleBibleCard({ projectId, bible }: { projectId: string; bible: Bible }) {
  const [f, setF] = useState({ artStyle: bible?.artStyle ?? '', palette: (bible?.palette ?? []).join(' '), lineWork: bible?.lineWork ?? '', lighting: bible?.lighting ?? '', cameraLanguage: bible?.cameraLanguage ?? '', notes: bible?.notes ?? '' });
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  if (!bible) return null;
  return (
    <Card title="Style Bible" actions={bible.locked ? <Badge tone="locked">locked by art approval</Badge> : null}>
      <div className="space-y-2 text-xs">
        <div className="flex gap-1">
          {bible.palette.map((c) => (
            <span key={c} className="h-5 w-5 rounded border border-line" style={{ background: c }} title={c} />
          ))}
        </div>
        {(['artStyle', 'palette', 'lineWork', 'lighting', 'cameraLanguage', 'notes'] as const).map((k) => (
          <Field key={k} label={k}>
            <input disabled={bible.locked} className={`${inputCls} text-xs`} value={f[k]} onChange={(e) => set(k, e.target.value)} />
          </Field>
        ))}
        {!bible.locked ? (
          <ActionButton size="sm" action="styleBible.update" input={() => ({ projectId, patch: { ...f, palette: f.palette.split(/[\s,]+/).filter(Boolean) } })} success="Style Bible saved">
            Save Style Bible
          </ActionButton>
        ) : null}
      </div>
    </Card>
  );
}
