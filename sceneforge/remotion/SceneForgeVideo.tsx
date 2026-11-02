/**
 * SceneForge composition: renders a Timeline. Shared by the browser preview (@remotion/player) and
 * the export renderer (@remotion/renderer). Limited 2D animation = layer swapping + transforms:
 * parallax camera, blinking, expression swaps, amplitude-driven mouth flaps, idle breathing, movement,
 * shakes/impacts, weather particles, lighting, transitions. It is not skeletal rigging.
 */
import React from 'react';
import { AbsoluteFill, Audio, Easing, Freeze, Img, interpolate, OffthreadVideo, random, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CompositionProps, TLAudioClip, TLCharacter, TLClip, Timeline } from '../lib/types';

const join = (base: string, p: string) => (/^(https?:|data:|blob:)/.test(p) ? p : base.replace(/\/$/, '') + '/' + p.split('/').map(encodeURIComponent).join('/'));

export const SceneForgeVideo: React.FC<CompositionProps & { withAudio?: boolean }> = ({ timeline, mediaBase, withAudio }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', overflow: 'hidden' }}>
      {timeline.clips.map((clip) => (
        <Sequence key={clip.id} from={clip.startFrame} durationInFrames={clip.durationInFrames} name={clip.label}>
          <ClipView clip={clip} mediaBase={mediaBase} />
        </Sequence>
      ))}
      {timeline.tracks.burnInSubtitles ? <Subtitles timeline={timeline} /> : null}
      {withAudio ? <AudioTracks timeline={timeline} mediaBase={mediaBase} /> : null}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------------------------

const ClipView: React.FC<{ clip: TLClip; mediaBase: string }> = ({ clip, mediaBase }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const d = clip.durationInFrames;
  const p = interpolate(frame, [0, Math.max(1, d - 1)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.ease) });
  const cam = {
    x: clip.camera.from.x + (clip.camera.to.x - clip.camera.from.x) * p,
    y: clip.camera.from.y + (clip.camera.to.y - clip.camera.from.y) * p,
    zoom: clip.camera.from.zoom + (clip.camera.to.zoom - clip.camera.from.zoom) * p,
  };
  // screen shake: decaying jitter after each shake frame
  let sx = 0;
  let sy = 0;
  for (const s of clip.camera.shakeFrames) {
    const k = frame - s;
    if (k >= 0 && k < 10) {
      const amp = (1 - k / 10) * 16 * clip.camera.intensity * (H / 1080);
      sx += (random(`sx${s}-${k}`) - 0.5) * 2 * amp;
      sy += (random(`sy${s}-${k}`) - 0.5) * 2 * amp;
    }
  }

  // transitions
  const t = clip.transitionIn;
  let opacity = 1;
  let clipPath: string | undefined;
  if (t.type === 'crossfade' && t.frames > 0) opacity = interpolate(frame, [0, t.frames], [0, 1], { extrapolateRight: 'clamp' });
  if (t.type === 'wipe' && t.frames > 0) clipPath = `inset(0 ${interpolate(frame, [0, t.frames], [100, 0], { extrapolateRight: 'clamp' })}% 0 0)`;
  const fadeBlack = t.type === 'fade' && t.frames > 0 ? interpolate(frame, [0, t.frames], [1, 0], { extrapolateRight: 'clamp' }) : 0;
  const flash = t.type === 'flash' && t.frames > 0 ? interpolate(frame, [0, t.frames], [1, 0], { extrapolateRight: 'clamp' }) : 0;
  const impactFlash = clip.effects.impacts.reduce((a, f) => {
    const k = frame - Math.round(f * d);
    return k >= 0 && k < 4 ? Math.max(a, 0.8 - k * 0.2) : a;
  }, 0);

  const worldStyle = (parallax: number): React.CSSProperties => ({
    position: 'absolute',
    inset: 0,
    transform: `translate(${-cam.x * W * parallax + sx}px, ${-cam.y * H * parallax + sy}px) scale(${1 + (cam.zoom - 1) * parallax})`,
    transformOrigin: '50% 45%',
  });

  return (
    <AbsoluteFill style={{ opacity, clipPath, backgroundColor: clip.backgroundColor, overflow: 'hidden' }}>
      {clip.video ? (
        <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px)` }}>
          {frame + clip.video.trimStartFrames < clip.video.sourceFrames ? (
            <OffthreadVideo src={join(mediaBase, clip.video.src)} muted startFrom={clip.video.trimStartFrames} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Freeze frame={Math.max(0, clip.video.sourceFrames - 1 - clip.video.trimStartFrames)}>
              <OffthreadVideo src={join(mediaBase, clip.video.src)} muted startFrom={clip.video.trimStartFrames} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </Freeze>
          )}
        </AbsoluteFill>
      ) : clip.still ? (
        <div style={worldStyle(1)}>
          <Img src={join(mediaBase, clip.still.src)} style={{ position: 'absolute', width: '112%', height: '112%', left: '-6%', top: '-6%', objectFit: 'cover' }} />
        </div>
      ) : (
        <>
          {clip.background
            .filter((l) => !l.front)
            .map((l, i) => (
              <div key={i} style={worldStyle(l.parallax)}>
                <Img src={join(mediaBase, l.src)} style={{ position: 'absolute', width: '116%', height: '116%', left: '-8%', top: '-8%', objectFit: 'cover' }} />
              </div>
            ))}
          <div style={worldStyle(1)}>
            {clip.characters.map((c, i) => (
              <CharacterSprite key={c.characterId + i} c={c} clip={clip} mediaBase={mediaBase} animate={clip.mode === 'A'} />
            ))}
          </div>
          {clip.background
            .filter((l) => l.front)
            .map((l, i) => (
              <div key={`f${i}`} style={worldStyle(l.parallax)}>
                <Img src={join(mediaBase, l.src)} style={{ position: 'absolute', width: '116%', height: '116%', left: '-8%', top: '-8%', objectFit: 'cover' }} />
              </div>
            ))}
        </>
      )}
      <Weather kind={clip.effects.weather} seed={clip.shotId} />
      {clip.effects.speedLines ? <SpeedLines seed={clip.shotId} /> : null}
      {clip.effects.tint && clip.effects.tintOpacity > 0 ? <AbsoluteFill style={{ backgroundColor: clip.effects.tint, opacity: clip.effects.tintOpacity, mixBlendMode: 'multiply' }} /> : null}
      {clip.effects.vignette > 0 ? <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,${clip.effects.vignette}) 100%)` }} /> : null}
      {impactFlash > 0 ? <AbsoluteFill style={{ backgroundColor: '#fff', opacity: impactFlash }} /> : null}
      {flash > 0 ? <AbsoluteFill style={{ backgroundColor: '#fff', opacity: flash }} /> : null}
      {fadeBlack > 0 ? <AbsoluteFill style={{ backgroundColor: '#000', opacity: fadeBlack }} /> : null}
      {clip.badge ? (
        <div style={{ position: 'absolute', left: W * 0.02, top: H * 0.025, padding: `${H * 0.006}px ${H * 0.012}px`, background: 'rgba(0,0,0,0.6)', color: '#ffcc33', fontFamily: 'Inter, DejaVu Sans, sans-serif', fontWeight: 700, fontSize: H * 0.022, borderRadius: 6, letterSpacing: 1 }}>
          {clip.badge}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const CharacterSprite: React.FC<{ c: TLCharacter; clip: TLClip; mediaBase: string; animate: boolean }> = ({ c, clip, mediaBase, animate }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  const h = c.heightFrac * H;
  const w = (c.width / c.height) * h;
  const d = clip.durationInFrames;
  let x = c.x;
  let bob = 0;
  if (animate && c.enterFrom !== 'none') {
    const from = c.enterFrom === 'left' ? -0.3 : 1.3;
    x = interpolate(frame, [0, Math.min(24, d / 2)], [from, c.x], { extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
    if (frame < 24) bob = Math.abs(Math.sin((frame / fps) * Math.PI * 4)) * h * 0.02;
  }
  if (animate && c.moveToX !== null) {
    const a = Math.round(d * 0.1);
    const b = Math.round(d * 0.85);
    x = interpolate(frame, [a, b], [c.x, c.moveToX], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad) });
    if (frame > a && frame < b) bob = Math.abs(Math.sin((frame / fps) * Math.PI * 5)) * h * 0.025;
  }
  // idle breathing
  const breathe = animate ? 1 + 0.008 * Math.sin((frame / fps) * Math.PI * 2 * 0.45 + c.blinkSeed) : 1;
  const sway = animate ? Math.sin((frame / fps) * Math.PI * 2 * 0.2 + c.blinkSeed) * 0.6 : 0;
  // blinking: ~every 2.6–4.4s, 3 frames
  const period = Math.round(fps * (2.6 + (c.blinkSeed % 18) / 10));
  const blink = animate && c.eyesClosed !== null && (frame + c.blinkSeed * 3) % period < 3;
  // mouth from cues
  const cue = c.mouthCues[frame] ?? '0';
  const mouth = c.mouths ? c.mouths[animate ? Number(cue) : 0] : null;
  const face = c.faceChange && frame >= c.faceChange.frame ? c.faceChange.face : c.face;
  const left = x * W - w / 2;
  const top = c.footY * H - h - bob;
  const layer: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' };
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: w,
        height: h,
        transform: `scaleX(${c.flip ? -1 : 1}) scaleY(${breathe}) rotate(${sway}deg)`,
        transformOrigin: '50% 100%',
      }}
    >
      <Img src={join(mediaBase, c.body)} style={layer} />
      {face ? <Img src={join(mediaBase, face)} style={layer} /> : null}
      {blink && c.eyesClosed ? <Img src={join(mediaBase, c.eyesClosed)} style={layer} /> : null}
      {mouth ? <Img src={join(mediaBase, mouth)} style={layer} /> : null}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------

const Weather: React.FC<{ kind: string; seed: string }> = ({ kind, seed }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H, fps } = useVideoConfig();
  if (!kind || kind === 'none') return null;
  const t = frame / fps;
  const n = { rain: 140, snow: 90, dust: 45, fireflies: 28, sparkles: 30, embers: 50 }[kind] ?? 0;
  const items = [];
  for (let i = 0; i < n; i++) {
    const r1 = random(`${seed}${kind}a${i}`);
    const r2 = random(`${seed}${kind}b${i}`);
    const r3 = random(`${seed}${kind}c${i}`);
    if (kind === 'rain') {
      const y = ((r2 * H + t * H * 1.6 * (0.8 + r3 * 0.4)) % (H + 80)) - 40;
      const x = (r1 * W + y * 0.18) % W;
      items.push(<div key={i} style={{ position: 'absolute', left: x, top: y, width: 2, height: H * 0.045, background: 'rgba(200,220,255,0.45)', transform: 'rotate(10deg)' }} />);
    } else if (kind === 'snow') {
      const y = ((r2 * H + t * H * 0.12 * (0.6 + r3)) % (H + 20)) - 10;
      const x = r1 * W + Math.sin(t * 1.3 + i) * 20;
      const s = 3 + r3 * 5;
      items.push(<div key={i} style={{ position: 'absolute', left: x, top: y, width: s, height: s, borderRadius: '50%', background: 'rgba(255,255,255,0.85)' }} />);
    } else if (kind === 'dust') {
      const x = (r1 * W + t * 18 * (r3 - 0.3)) % W;
      const y = r2 * H + Math.sin(t * 0.7 + i) * 12;
      items.push(<div key={i} style={{ position: 'absolute', left: x, top: y, width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,240,210,0.35)' }} />);
    } else if (kind === 'embers') {
      const y = H - ((r2 * H + t * H * 0.15 * (0.6 + r3)) % (H + 20));
      const x = r1 * W + Math.sin(t * 2 + i) * 15;
      items.push(<div key={i} style={{ position: 'absolute', left: x, top: y, width: 4, height: 4, borderRadius: '50%', background: '#ffb347', boxShadow: '0 0 8px #ff7a00', opacity: 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + i)) }} />);
    } else {
      // fireflies / sparkles: drifting glowing points that pulse
      const x = r1 * W + Math.sin(t * 0.6 + i * 1.7) * 30;
      const y = r2 * H * 0.85 + Math.cos(t * 0.5 + i) * 20;
      const glow = Math.max(0, Math.sin(t * (1.5 + r3 * 2) + i));
      const color = kind === 'fireflies' ? '#d9ff7a' : '#fff6c8';
      const s = kind === 'fireflies' ? 6 : 4 + r3 * 4;
      items.push(<div key={i} style={{ position: 'absolute', left: x, top: y, width: s, height: s, borderRadius: '50%', background: color, boxShadow: `0 0 ${s * 3}px ${color}`, opacity: glow }} />);
    }
  }
  return <AbsoluteFill style={{ pointerEvents: 'none' }}>{items}</AbsoluteFill>;
};

const SpeedLines: React.FC<{ seed: string }> = ({ seed }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const k = Math.floor(frame / 2);
  const lines = [];
  for (let i = 0; i < 26; i++) {
    const y = random(`${seed}sl${k}-${i}`) * H;
    const len = W * (0.15 + random(`${seed}sll${k}-${i}`) * 0.3);
    const x = random(`${seed}slx${k}-${i}`) * W;
    lines.push(<line key={i} x1={x} y1={y} x2={x - len} y2={y} stroke="rgba(255,255,255,0.55)" strokeWidth={2 + random(`${seed}slw${i}`) * 3} />);
  }
  return (
    <AbsoluteFill>
      <svg width={W} height={H}>{lines}</svg>
    </AbsoluteFill>
  );
};

const Subtitles: React.FC<{ timeline: Timeline }> = ({ timeline }) => {
  const frame = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const cue = timeline.subtitles.find((s) => frame >= s.startFrame && frame < s.endFrame);
  if (!cue) return null;
  const fs = Math.round(Math.min(W, H) * 0.042);
  return (
    <div style={{ position: 'absolute', left: W * 0.08, right: W * 0.08, bottom: H * 0.06, textAlign: 'center' }}>
      <span
        style={{
          display: 'inline-block',
          background: 'rgba(0,0,0,0.55)',
          color: '#fff',
          padding: `${fs * 0.25}px ${fs * 0.6}px`,
          borderRadius: fs * 0.3,
          fontFamily: 'Inter, DejaVu Sans, sans-serif',
          fontSize: fs,
          fontWeight: 600,
          lineHeight: 1.3,
          textShadow: '0 2px 4px rgba(0,0,0,0.8)',
        }}
      >
        {cue.speaker ? <span style={{ color: '#ffd166' }}>{cue.speaker}: </span> : null}
        {cue.text}
      </span>
    </div>
  );
};

/** Preview-only audio (exports mix audio with FFmpeg for ducking/limiting). */
const AudioTracks: React.FC<{ timeline: Timeline; mediaBase: string }> = ({ timeline, mediaBase }) => {
  const tr = timeline.tracks;
  const vol = (c: TLAudioClip) => {
    const t = tr[c.track];
    return t.muted ? 0 : t.volume * c.volume;
  };
  return (
    <>
      {timeline.audio
        .filter((c) => vol(c) > 0)
        .map((c) => (
          <Sequence key={c.id} from={c.startFrame} durationInFrames={c.durationInFrames}>
            <Audio src={join(mediaBase, c.src)} volume={vol(c)} loop={c.loop} startFrom={c.trimStartFrames} />
          </Sequence>
        ))}
    </>
  );
};
