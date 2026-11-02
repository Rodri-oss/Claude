'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { SceneForgeVideo } from '@/remotion/SceneForgeVideo';
import { rpc, toast } from '@/components/api';
import { ActionButton, Badge, Button, Card, Field, fmtSec, inputCls, cx } from '@/components/ui';
import type { Timeline, TrackSettings, AudioTrackKind } from '@/lib/types';

type Shot = { id: string; seq: number; durationSec: number; trimStartSec: number; transitionIn: string; mode: string; purpose: string };
type Settings = { tracks: TrackSettings; musicAssetId: string | null; ambienceAssetId: string | null; musicFadeSec: number; transitionFrames: number };

const MODE_COLOR: Record<string, string> = { A: 'bg-teal-600/70', B: 'bg-orange-600/70', C: 'bg-indigo-600/70' };

export function Editor({ projectId, initial, settings, shots, music, ambience, storyboardApproved }: { projectId: string; initial: { id: string; version: number; timeline: Timeline } | null; settings: Settings; shots: Shot[]; music: { id: string; name: string }[]; ambience: { id: string; name: string }[]; storyboardApproved: boolean }) {
  const [tl, setTl] = useState(initial);
  const [s, setS] = useState<Settings>(settings);
  const [busy, setBusy] = useState(false);
  const [frame, setFrame] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [pxPerSec, setPx] = useState(14);
  const player = useRef<PlayerRef>(null);

  const rebuild = async () => {
    setBusy(true);
    try {
      const r = await rpc<{ id: string; version: number; timeline: Timeline }>('timeline.build', { projectId });
      setTl(r);
      toast(`Timeline v${r.version} built`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!initial && storyboardApproved) void rebuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const h = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    p.addEventListener('frameupdate', h);
    return () => p.removeEventListener('frameupdate', h);
  }, [tl]);

  const saveSettings = async (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    try {
      await rpc('editor.update', { projectId, ...patch });
      await rebuild();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const timeline = tl?.timeline;
  const inputProps = useMemo(() => (timeline ? { timeline, mediaBase: '/api/media', withAudio: true } : null), [timeline]);
  const fps = timeline?.fps ?? 24;
  const width = timeline ? (timeline.durationInFrames / fps) * pxPerSec : 0;
  const sel = timeline?.clips.find((c) => c.id === selected);
  const selShot = sel ? shots.find((x) => x.id === sel.shotId) : undefined;

  if (!timeline || !inputProps)
    return (
      <Card title="Editor">
        <div className="space-y-3 text-sm text-muted">
          <p>No timeline yet. The timeline is built from approved shots, the active shot versions and the actual dialogue audio durations.</p>
          <Button variant="primary" disabled={busy || !storyboardApproved} onClick={rebuild}>
            Build timeline
          </Button>
          {!storyboardApproved ? <p className="text-amber-300">Approve the storyboard first.</p> : null}
        </div>
      </Card>
    );

  const audioTrack = (kind: AudioTrackKind) => timeline.audio.filter((a) => a.track === kind);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <div className="overflow-hidden rounded-lg border border-line bg-black">
            <Player
              ref={player}
              component={SceneForgeVideo}
              inputProps={inputProps}
              durationInFrames={timeline.durationInFrames}
              fps={timeline.fps}
              compositionWidth={timeline.width}
              compositionHeight={timeline.height}
              style={{ width: '100%', aspectRatio: `${timeline.width}/${timeline.height}`, maxHeight: '62vh' }}
              controls
              acknowledgeRemotionLicense
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted">
            <span>
              Timeline v{tl!.version} · {fmtSec(timeline.durationInFrames / fps)} ({timeline.durationInFrames} frames @ {fps} fps) · {timeline.clips.length} shots
            </span>
            <span>
              frame {frame} · {(frame / fps).toFixed(2)}s
            </span>
          </div>
        </div>
        <div className="space-y-3">
          <Card title="Timeline" actions={<Button size="sm" variant="primary" disabled={busy} onClick={rebuild}>{busy ? 'Building…' : 'Rebuild'}</Button>}>
            <p className="text-[11px] text-muted">Rebuild after changing shots, versions or audio. Timing comes from the real audio durations, never from script estimates alone.</p>
          </Card>
          {sel && selShot ? (
            <ClipPanel key={sel.id + selShot.durationSec + selShot.trimStartSec + selShot.transitionIn} shot={selShot} clipFrames={sel.durationInFrames} fps={fps} badge={sel.badge} onSaved={rebuild} />
          ) : (
            <Card title="Clip">
              <p className="text-xs text-muted">Select a clip on the video track to trim, retime, change its transition or reorder it.</p>
            </Card>
          )}
        </div>
      </div>
      <Card
        title="Tracks"
        actions={
          <label className="flex items-center gap-2 text-xs text-muted">
            zoom <input type="range" min={4} max={60} value={pxPerSec} onChange={(e) => setPx(Number(e.target.value))} />
          </label>
        }
      >
        <div className="flex">
          <div className="w-28 shrink-0 space-y-1 pt-5 text-[11px] text-muted">
            {['Video / shots', 'Background', 'Dialogue', 'Music', 'Ambience', 'SFX', 'Subtitles'].map((t) => (
              <div key={t} className="flex h-8 items-center">
                {t}
              </div>
            ))}
          </div>
          <div className="relative overflow-x-auto">
            <div style={{ width }} className="relative">
              <div className="relative h-5 text-[10px] text-muted">
                {Array.from({ length: Math.ceil(timeline.durationInFrames / fps / 10) + 1 }, (_, i) => (
                  <span key={i} className="absolute" style={{ left: i * 10 * pxPerSec }}>
                    {fmtSec(i * 10)}
                  </span>
                ))}
              </div>
              <div
                className="space-y-1"
                onClick={(e) => {
                  const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const f = Math.max(0, Math.round(((e.clientX - r.left) / pxPerSec) * fps));
                  player.current?.seekTo(Math.min(f, timeline.durationInFrames - 1));
                }}
              >
                <Row>
                  {timeline.clips.map((c) => (
                    <Block
                      key={c.id}
                      left={(c.startFrame / fps) * pxPerSec}
                      w={(c.durationInFrames / fps) * pxPerSec}
                      className={cx(MODE_COLOR[c.mode], selected === c.id && 'ring-2 ring-accent', c.badge && 'outline-dashed outline-1 outline-yellow-400')}
                      title={`${c.label} (${c.mode}) ${c.badge ?? ''}`}
                      onClick={() => {
                        setSelected(c.id);
                        player.current?.seekTo(c.startFrame + Math.min(c.durationInFrames - 1, Math.round(fps / 2)));
                      }}
                    >
                      {c.label}
                    </Block>
                  ))}
                </Row>
                <Row>
                  {timeline.clips.map((c) => (
                    <Block key={c.id} left={(c.startFrame / fps) * pxPerSec} w={(c.durationInFrames / fps) * pxPerSec} className="bg-slate-600/50">
                      {c.video ? 'video' : c.still ? 'still' : `${c.background.length} layers · ${c.characters.length} chars`}
                    </Block>
                  ))}
                </Row>
                {(['dialogue', 'music', 'ambience', 'sfx'] as const).map((k) => (
                  <Row key={k}>
                    {audioTrack(k).map((a) => (
                      <Block key={a.id} left={(a.startFrame / fps) * pxPerSec} w={(a.durationInFrames / fps) * pxPerSec} className={k === 'dialogue' ? 'bg-emerald-600/60' : k === 'music' ? 'bg-fuchsia-600/50' : k === 'ambience' ? 'bg-cyan-700/50' : 'bg-yellow-600/60'} title={a.label}>
                        {a.label}
                      </Block>
                    ))}
                  </Row>
                ))}
                <Row>
                  {timeline.subtitles.map((st, i) => (
                    <Block key={i} left={(st.startFrame / fps) * pxPerSec} w={((st.endFrame - st.startFrame) / fps) * pxPerSec} className="bg-slate-500/50" title={st.text}>
                      {st.text}
                    </Block>
                  ))}
                </Row>
              </div>
              <div className="pointer-events-none absolute top-5 bottom-0 w-px bg-accent" style={{ left: (frame / fps) * pxPerSec }} />
            </div>
          </div>
        </div>
      </Card>
      <Card title="Mix & export settings">
        <div className="grid grid-cols-5 gap-4 text-xs">
          {(['dialogue', 'music', 'ambience', 'sfx'] as const).map((k) => (
            <div key={k} className="space-y-1">
              <div className="font-medium capitalize">{k}</div>
              <input type="range" min={0} max={1.5} step={0.05} value={s.tracks[k].volume} onChange={(e) => setS({ ...s, tracks: { ...s.tracks, [k]: { ...s.tracks[k], volume: Number(e.target.value) } } })} onMouseUp={() => saveSettings({ tracks: s.tracks })} />
              <div className="flex items-center justify-between text-muted">
                <span>{Math.round(s.tracks[k].volume * 100)}%</span>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={s.tracks[k].muted} onChange={(e) => saveSettings({ tracks: { ...s.tracks, [k]: { ...s.tracks[k], muted: e.target.checked } } })} /> mute
                </label>
              </div>
              {k === 'music' ? (
                <>
                  <label className="flex items-center gap-1 text-muted">
                    <input type="checkbox" checked={s.tracks.music.duckUnderDialogue} onChange={(e) => saveSettings({ tracks: { ...s.tracks, music: { ...s.tracks.music, duckUnderDialogue: e.target.checked } } })} /> duck under dialogue
                  </label>
                  <select className={`${inputCls} text-xs`} value={s.musicAssetId ?? ''} onChange={(e) => saveSettings({ musicAssetId: e.target.value || null })}>
                    <option value="">no default music</option>
                    {music.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              {k === 'ambience' ? (
                <select className={`${inputCls} text-xs`} value={s.ambienceAssetId ?? ''} onChange={(e) => saveSettings({ ambienceAssetId: e.target.value || null })}>
                  <option value="">no default ambience</option>
                  {ambience.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ))}
          <div className="space-y-2">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={s.tracks.burnInSubtitles} onChange={(e) => saveSettings({ tracks: { ...s.tracks, burnInSubtitles: e.target.checked } })} /> burn-in subtitles (SRT always exported)
            </label>
            <Field label={`Transition length: ${s.transitionFrames} frames`}>
              <input type="range" min={0} max={36} value={s.transitionFrames} onChange={(e) => setS({ ...s, transitionFrames: Number(e.target.value) })} onMouseUp={() => saveSettings({ transitionFrames: s.transitionFrames })} />
            </Field>
            <Field label={`Music fade: ${s.musicFadeSec}s`}>
              <input type="range" min={0} max={6} step={0.5} value={s.musicFadeSec} onChange={(e) => setS({ ...s, musicFadeSec: Number(e.target.value) })} onMouseUp={() => saveSettings({ musicFadeSec: s.musicFadeSec })} />
            </Field>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted">The browser preview plays raw tracks; the export mix additionally applies sidechain ducking, fades and a limiter (FFmpeg).</p>
      </Card>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="relative h-8 rounded bg-panel2/60">{children}</div>;
}

function Block({ left, w, className, children, title, onClick }: { left: number; w: number; className?: string; children?: React.ReactNode; title?: string; onClick?: () => void }) {
  return (
    <div
      title={title}
      onClick={(e) => {
        if (onClick) {
          e.stopPropagation();
          onClick();
        }
      }}
      className={cx('absolute top-0.5 bottom-0.5 cursor-pointer overflow-hidden truncate rounded px-1 text-[10px] leading-7 text-white', className)}
      style={{ left, width: Math.max(2, w - 1) }}
    >
      {children}
    </div>
  );
}

function ClipPanel({ shot, clipFrames, fps, badge, onSaved }: { shot: Shot; clipFrames: number; fps: number; badge: string | null; onSaved: () => void }) {
  const [d, setD] = useState(shot.durationSec);
  const [trim, setTrim] = useState(shot.trimStartSec);
  const [tr, setTr] = useState(shot.transitionIn);
  return (
    <Card title={`Shot #${shot.seq}`} actions={<Badge tone={shot.mode}>{shot.mode}</Badge>}>
      <div className="space-y-2 text-xs">
        <div className="text-muted">{shot.purpose}</div>
        {badge ? <div className="text-yellow-300">{badge}</div> : null}
        <div className="text-muted">
          In timeline: {(clipFrames / fps).toFixed(2)}s (planned {shot.durationSec}s; dialogue may extend it)
        </div>
        <Field label="Planned duration (s)">
          <input type="number" step={0.1} min={0.5} max={30} className={inputCls} value={d} onChange={(e) => setD(Number(e.target.value))} />
        </Field>
        {shot.mode === 'B' ? (
          <Field label="Trim start of AI clip (s)">
            <input type="number" step={0.1} min={0} max={20} className={inputCls} value={trim} onChange={(e) => setTrim(Number(e.target.value))} />
          </Field>
        ) : null}
        <Field label="Transition in">
          <select className={inputCls} value={tr} onChange={(e) => setTr(e.target.value)}>
            {['cut', 'fade', 'crossfade', 'wipe', 'flash'].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap gap-1">
          <ActionButton size="sm" variant="primary" action="shot.update" input={() => ({ shotId: shot.id, patch: { durationSec: d, trimStartSec: trim, transitionIn: tr } })} onDone={onSaved} refresh={false}>
            Apply
          </ActionButton>
          <ActionButton size="sm" action="shot.move" input={{ shotId: shot.id, direction: -1 }} onDone={onSaved} refresh={false}>
            ← Move earlier
          </ActionButton>
          <ActionButton size="sm" action="shot.move" input={{ shotId: shot.id, direction: 1 }} onDone={onSaved} refresh={false}>
            Move later →
          </ActionButton>
        </div>
        <a className="text-accent hover:underline" href={`animation`}>
          Replace footage / pick another version →
        </a>
      </div>
    </Card>
  );
}
