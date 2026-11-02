/**
 * Builds the frame-accurate Timeline from the database. Timing comes from ACTUAL generated audio
 * durations when available (falls back to estimates only for lines without audio).
 */
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { hashOf, newId } from '../ids';
import { requireProject } from '../story/service';
import { listShots } from '../shots/service';
import { activeSegments } from '../audio/service';
import { estimateLineSec, LINE_GAP_SEC, NARRATOR } from '../story/draft';
import { cameraKeys, framingPlacement } from '../animation/staging';
import { getAsset } from '../assets/service';
import { environmentLayersFor } from '../environments/service';
import {
  DEFAULT_TRACK_SETTINGS,
  type ShotMode,
  type TLAudioClip,
  type TLCharacter,
  type TLClip,
  type TLSubtitle,
  type Timeline,
  type TrackSettings,
  type TransitionType,
} from '../types';

const LEAD_SEC = 0.35;
const TAIL_SEC = 0.55;

const rel = (assetId: string | null | undefined) => (assetId ? getAsset(assetId)?.path ?? null : null);

export function getEditorSettings(projectId: string) {
  const db = getDb();
  let s = db.select().from(schema.editorSettings).where(eq(schema.editorSettings.projectId, projectId)).get();
  if (!s) {
    db.insert(schema.editorSettings).values({ projectId, tracks: structuredClone(DEFAULT_TRACK_SETTINGS) }).onConflictDoNothing().run();
    s = db.select().from(schema.editorSettings).where(eq(schema.editorSettings.projectId, projectId)).get()!;
  }
  return s;
}

export function updateEditorSettings(projectId: string, patch: Partial<{ tracks: TrackSettings; musicAssetId: string | null; ambienceAssetId: string | null; musicFadeSec: number; transitionFrames: number }>) {
  getEditorSettings(projectId);
  if (patch.musicAssetId && getAsset(patch.musicAssetId)?.kind !== 'audio') throw new Error('Music must be an audio asset');
  if (patch.ambienceAssetId && getAsset(patch.ambienceAssetId)?.kind !== 'audio') throw new Error('Ambience must be an audio asset');
  getDb().update(schema.editorSettings).set(patch).where(eq(schema.editorSettings.projectId, projectId)).run();
}

/** Synthetic flap for lines that have no audio yet (≈6 Hz), so previews still animate. */
function syntheticCues(frames: number, fps: number) {
  let s = '';
  for (let i = 0; i < frames; i++) s += Math.floor((i * 6 * 2) / fps) % 2 ? '1' : '0';
  return s;
}

export function buildTimeline(projectId: string): Timeline {
  const db = getDb();
  const project = requireProject(projectId);
  const fps = project.fps;
  const W = project.width;
  const H = project.height;
  const ed = getEditorSettings(projectId);
  const tracks = ed.tracks;
  const shots = listShots(projectId);
  const scenes = db.select().from(schema.scenes).where(eq(schema.scenes.projectId, projectId)).orderBy(asc(schema.scenes.seq)).all();
  const allLineIds = shots.flatMap((s) => s.dialogueLineIds);
  const lines = allLineIds.length ? db.select().from(schema.dialogueLines).where(inArray(schema.dialogueLines.id, allLineIds)).all() : [];
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const segs = activeSegments(allLineIds);
  const characters = new Map(db.select().from(schema.characters).all().map((c) => [c.id, c]));
  const envs = new Map(db.select().from(schema.environments).all().map((e) => [e.id, e]));
  const versions = shots.length ? db.select().from(schema.shotVersions).where(inArray(schema.shotVersions.shotId, shots.map((s) => s.id))).all() : [];
  const verById = new Map(versions.map((v) => [v.id, v]));

  const clips: TLClip[] = [];
  const audio: TLAudioClip[] = [];
  const subtitles: TLSubtitle[] = [];
  const sceneRanges: Timeline['scenes'] = [];
  let cursor = 0;
  const tf = Math.max(0, ed.transitionFrames);

  for (const shot of shots) {
    // --- dialogue layout (actual audio durations) ---
    const placed: { lineId: string; start: number; frames: number; speakerId: string | null; speaker: string; text: string; seg: ReturnType<typeof segs.get> }[] = [];
    let t = Math.round(LEAD_SEC * fps);
    for (const lid of shot.dialogueLineIds) {
      const l = lineById.get(lid);
      if (!l) continue;
      const seg = segs.get(lid);
      const frames = Math.max(1, Math.round((seg ? seg.durationSec : estimateLineSec(l.text, l.emotion, l.speed)) * fps));
      placed.push({ lineId: lid, start: t, frames, speakerId: l.characterId, speaker: l.speakerName, text: l.text, seg });
      t += frames + Math.round(LINE_GAP_SEC * fps);
    }
    const speechEnd = placed.length ? placed[placed.length - 1].start + placed[placed.length - 1].frames + Math.round(TAIL_SEC * fps) : 0;
    let duration = Math.max(Math.round(shot.durationSec * fps), speechEnd, Math.round(0.5 * fps));

    // --- transition ---
    let transition = (shot.transitionIn as TransitionType) ?? 'cut';
    if (clips.length === 0 && (transition === 'crossfade' || transition === 'wipe')) transition = 'fade';
    const overlap = transition === 'crossfade' || transition === 'wipe' ? Math.min(tf, Math.floor(duration / 3), clips.length ? Math.floor(clips[clips.length - 1].durationInFrames / 3) : 0) : 0;
    const start = cursor - overlap;
    const transFrames = transition === 'cut' ? 0 : transition === 'flash' ? Math.min(6, tf) : overlap || Math.min(tf, Math.floor(duration / 3));

    // --- visuals ---
    const env = shot.environmentId ? envs.get(shot.environmentId) : undefined;
    const layers = environmentLayersFor(shot.environmentId).map((r) => ({ src: r.a.path, parallax: r.l.parallax, front: r.l.role === 'foreground' || r.l.role === 'overlay' }));
    const place = framingPlacement(shot.camera.framing, W / H);
    const tlChars: TLCharacter[] = [];
    shot.characters.forEach((sc, i) => {
      const c = characters.get(sc.characterId);
      if (!c?.rig) return;
      const rig = c.rig;
      const body = rel(rig.poses[sc.pose] ?? Object.values(rig.poses)[0]);
      if (!body) return;
      const faceId = rig.faces[sc.expression] ?? rig.faces.neutral ?? Object.values(rig.faces)[0];
      const mouths = rig.mouths ? ([rel(rig.mouths.closed), rel(rig.mouths.open), rel(rig.mouths.wide)] as [string, string, string]) : null;
      let cues = '';
      for (const p of placed) {
        if (p.speakerId !== sc.characterId) continue;
        const raw = p.seg ? p.seg.mouthCues : syntheticCues(p.frames, fps);
        const resampled = p.seg && p.seg.cueFps !== fps ? resample(raw, p.seg.cueFps, fps) : raw;
        cues = cues.padEnd(p.start, '0') + resampled.slice(0, p.frames);
      }
      tlChars.push({
        characterId: c.id,
        name: c.name,
        width: rig.width,
        height: rig.height,
        body,
        face: rel(faceId),
        faceChange: sc.expressionChange ? { frame: Math.round(sc.expressionChange.at * duration), face: rel(rig.faces[sc.expressionChange.expression]) } : null,
        eyesClosed: rel(rig.eyesClosed),
        mouths,
        x: sc.x,
        moveToX: sc.moveToX,
        enterFrom: sc.enterFrom,
        footY: place.footY,
        heightFrac: place.heightFrac,
        flip: sc.flip,
        blinkSeed: (hashNum(c.id) + i * 17) % 97,
        mouthCues: cues,
      });
    });

    let mode = shot.mode as ShotMode;
    let video: TLClip['video'] = null;
    let still: TLClip['still'] = null;
    let badge: string | null = null;
    const active = shot.activeVersionId ? verById.get(shot.activeVersionId) : undefined;
    if (mode === 'B') {
      const a = active && active.kind === 'video' && active.status !== 'rejected' ? getAsset(active.assetId) : undefined;
      if (a) {
        const sourceFrames = Math.max(1, Math.round((a.durationSec ?? 0) * fps));
        const mock = a.provenance.source === 'mock';
        video = { src: a.path, trimStartFrames: Math.round(shot.trimStartSec * fps), sourceFrames, mock };
        if (mock) badge = 'MOCK AI VIDEO';
        else if (active!.status !== 'approved') badge = 'UNAPPROVED AI CLIP';
      } else {
        badge = 'AI SHOT PENDING — limited-animation fallback';
        mode = 'A';
      }
    } else if (mode === 'C') {
      const v = active && active.kind === 'still' ? active : shot.startImageVersionId ? verById.get(shot.startImageVersionId) : undefined;
      const a = v ? getAsset(v.assetId) : undefined;
      if (a) {
        still = { src: a.path };
        if (a.provenance.source === 'mock') badge = 'MOCK IMAGE';
      }
    }

    const cam = cameraKeys(shot.camera.move, shot.camera.intensity);
    const shakeFrames = [
      ...shot.effects.impacts.map((f) => Math.round(f * duration)),
      ...(shot.camera.move === 'shake' ? Array.from({ length: Math.floor(duration / (fps * 0.9)) }, (_, k) => Math.round((k + 0.5) * fps * 0.9)) : []),
    ];
    clips.push({
      id: `clip_${shot.id}`,
      shotId: shot.id,
      sceneId: shot.sceneId,
      sceneIndex: shot.sceneSeq,
      label: `#${shot.seq} ${shot.purpose}`.slice(0, 80),
      mode,
      startFrame: start,
      durationInFrames: duration,
      transitionIn: { type: transition, frames: transFrames },
      background: layers,
      backgroundColor: env?.backgroundColor ?? '#1b1f2a',
      camera: { from: cam.from, to: cam.to, shakeFrames, intensity: shot.camera.intensity },
      characters: tlChars,
      video,
      still,
      effects: shot.effects,
      badge,
    });

    // --- audio + subtitles ---
    for (const p of placed) {
      if (p.seg) {
        const a = getAsset(p.seg.assetId);
        if (a)
          audio.push({ id: `dlg_${p.lineId}`, track: 'dialogue', src: a.path, startFrame: start + p.start, durationInFrames: p.frames, trimStartFrames: 0, volume: 1, fadeInFrames: 0, fadeOutFrames: 0, loop: false, label: `${p.speaker}: ${p.text.slice(0, 30)}`, dialogueLineId: p.lineId });
      }
      subtitles.push({ startFrame: start + p.start, endFrame: start + p.start + p.frames, speaker: p.speaker === NARRATOR ? null : p.speaker, text: p.text });
    }
    for (const fx of shot.sfx) {
      const a = getAsset(fx.assetId);
      if (!a) continue;
      const f = Math.max(1, Math.round((a.durationSec ?? 1) * fps));
      audio.push({ id: `sfx_${shot.id}_${fx.assetId}_${fx.at}`, track: 'sfx', src: a.path, startFrame: start + Math.round(fx.at * duration), durationInFrames: f, trimStartFrames: 0, volume: fx.volume, fadeInFrames: 0, fadeOutFrames: Math.min(6, f), loop: false, label: a.name });
    }
    cursor = start + duration;
  }
  const total = Math.max(1, cursor);

  // scene ranges + per-scene music/ambience overrides
  for (const sc of scenes) {
    const sc_clips = clips.filter((c) => c.sceneId === sc.id);
    if (!sc_clips.length) continue;
    const a = sc_clips[0].startFrame;
    const b = sc_clips[sc_clips.length - 1].startFrame + sc_clips[sc_clips.length - 1].durationInFrames;
    sceneRanges.push({ sceneId: sc.id, index: sc.seq, title: sc.title, startFrame: a, endFrame: b });
  }
  const fadeF = Math.round(ed.musicFadeSec * fps);
  const addBed = (track: 'music' | 'ambience', assetId: string, from: number, to: number, idSuffix: string) => {
    const a = getAsset(assetId);
    if (!a) return;
    audio.push({ id: `${track}_${idSuffix}`, track, src: a.path, startFrame: from, durationInFrames: to - from, trimStartFrames: 0, volume: 1, fadeInFrames: Math.min(fadeF, Math.floor((to - from) / 3)), fadeOutFrames: Math.min(fadeF, Math.floor((to - from) / 3)), loop: true, label: a.name });
  };
  const sceneMusic = sceneRanges.map((r) => ({ r, s: scenes.find((s) => s.id === r.sceneId)! }));
  const musicOverrides = sceneMusic.filter((x) => x.s.music && getAsset(x.s.music));
  const ambOverrides = sceneMusic.filter((x) => x.s.ambience && getAsset(x.s.ambience));
  if (musicOverrides.length) for (const x of musicOverrides) addBed('music', x.s.music, x.r.startFrame, x.r.endFrame, x.s.id);
  else if (ed.musicAssetId) addBed('music', ed.musicAssetId, 0, total, 'main');
  if (ambOverrides.length) for (const x of ambOverrides) addBed('ambience', x.s.ambience, x.r.startFrame, x.r.endFrame, x.s.id);
  else if (ed.ambienceAssetId) addBed('ambience', ed.ambienceAssetId, 0, total, 'main');

  return { schema: 1, projectId, fps, width: W, height: H, durationInFrames: total, clips, audio, subtitles, tracks, scenes: sceneRanges };
}

function resample(cues: string, fromFps: number, toFps: number) {
  const n = Math.round((cues.length * toFps) / fromFps);
  let out = '';
  for (let i = 0; i < n; i++) out += cues[Math.min(cues.length - 1, Math.floor((i * fromFps) / toFps))] ?? '0';
  return out;
}

function hashNum(s: string) {
  let h = 7;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Build and persist a new timeline version if anything changed. */
export function saveTimeline(projectId: string) {
  const tl = buildTimeline(projectId);
  const hash = hashOf(tl);
  const db = getDb();
  const latest = db.select().from(schema.timelines).where(eq(schema.timelines.projectId, projectId)).orderBy(desc(schema.timelines.version)).get();
  if (latest && latest.hash === hash) return latest;
  const id = newId('tln');
  db.insert(schema.timelines).values({ id, projectId, version: (latest?.version ?? 0) + 1, data: tl, hash }).run();
  return db.select().from(schema.timelines).where(eq(schema.timelines.id, id)).get()!;
}

export function latestTimeline(projectId: string) {
  return getDb().select().from(schema.timelines).where(eq(schema.timelines.projectId, projectId)).orderBy(desc(schema.timelines.version)).get() ?? null;
}

export function getTimeline(id: string) {
  return getDb().select().from(schema.timelines).where(eq(schema.timelines.id, id)).get() ?? null;
}
