import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { bins, paths } from '../config';
import { resolveDataPath } from '../assets/storage';
import { ffmpeg } from '../media/ffmpeg';
import type { Timeline, TLAudioClip } from '../types';

// ---------------------------------------------------------------------------------------------
// Remotion bundle (cached by source hash)
// ---------------------------------------------------------------------------------------------

let bundlePromise: { hash: string; p: Promise<string> } | null = null;

function remotionSourceHash() {
  const files = ['remotion/index.ts', 'remotion/Root.tsx', 'remotion/SceneForgeVideo.tsx', 'lib/types.ts'];
  const h = crypto.createHash('sha1');
  for (const f of files) h.update(fs.readFileSync(path.join(process.cwd(), f)));
  return h.digest('hex').slice(0, 16);
}

export async function ensureBundle(): Promise<string> {
  const hash = remotionSourceHash();
  if (bundlePromise?.hash === hash) return bundlePromise.p;
  const outDir = path.join(paths.renderCache(), `bundle-${hash}`);
  const p = (async () => {
    if (fs.existsSync(path.join(outDir, 'index.html'))) return outDir;
    const { bundle } = await import('@remotion/bundler');
    const tmpOut = `${outDir}.tmp-${process.pid}`;
    fs.rmSync(tmpOut, { recursive: true, force: true });
    const serveUrl = await bundle({ entryPoint: path.join(process.cwd(), 'remotion', 'index.ts'), outDir: tmpOut, enableCaching: true });
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.renameSync(serveUrl, outDir);
    return outDir;
  })();
  bundlePromise = { hash, p };
  p.catch(() => (bundlePromise = null));
  return p;
}

// ---------------------------------------------------------------------------------------------
// Local media server: serves ONLY files inside the data dir, read-only, bound to 127.0.0.1, with Range support
// ---------------------------------------------------------------------------------------------

const MIME: Record<string, string> = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.flac': 'audio/flac' };

export function serveFile(abs: string, req: http.IncomingMessage, res: http.ServerResponse) {
  const stat = fs.statSync(abs);
  const type = MIME[path.extname(abs).toLowerCase()] ?? 'application/octet-stream';
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', type);
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (range) {
    const start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(stat.size - 1, Number(range[2])) : stat.size - 1;
    if (start >= stat.size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(abs, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'Content-Length': stat.size });
    fs.createReadStream(abs).pipe(res);
  }
}

export async function startMediaServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405);
        return res.end();
      }
      const rel = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
      const abs = resolveDataPath(rel);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
        res.writeHead(404);
        return res.end();
      }
      serveFile(abs, req, res);
    } catch {
      res.writeHead(400);
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const port = (server.address() as { port: number }).port;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) };
}

// ---------------------------------------------------------------------------------------------
// Video render (muted; audio is mixed separately with FFmpeg)
// ---------------------------------------------------------------------------------------------

export async function renderVideo(opts: { timeline: Timeline; outPath: string; scale?: number; frameRange?: [number, number]; onProgress?: (p: number) => void; crf?: number }) {
  const serveUrl = await ensureBundle();
  const { selectComposition, renderMedia } = await import('@remotion/renderer');
  const media = await startMediaServer();
  try {
    const inputProps = { timeline: opts.timeline, mediaBase: media.url };
    const browserExecutable = bins.browser();
    const composition = await selectComposition({ serveUrl, id: 'SceneForge', inputProps, browserExecutable, logLevel: 'error' });
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: opts.outPath,
      inputProps,
      browserExecutable,
      muted: true,
      crf: opts.crf ?? 18,
      pixelFormat: 'yuv420p',
      scale: opts.scale ?? 1,
      frameRange: opts.frameRange ?? null,
      concurrency: Math.max(1, Math.min(8, os.cpus().length)),
      timeoutInMilliseconds: 120_000,
      logLevel: 'error',
      onProgress: ({ progress }) => opts.onProgress?.(progress),
    });
  } finally {
    await media.close();
  }
}

// ---------------------------------------------------------------------------------------------
// Audio mix: per-track buses, fades, ducking (sidechain), limiter, clipping check
// ---------------------------------------------------------------------------------------------

export async function mixAudio(timeline: Timeline, outWav: string, range?: [number, number]) {
  const fps = timeline.fps;
  const [r0, r1] = range ?? [0, timeline.durationInFrames - 1];
  const totalSec = (r1 - r0 + 1) / fps;
  const tr = timeline.tracks;
  const clips = timeline.audio.filter((c) => !tr[c.track].muted && c.startFrame <= r1 && c.startFrame + c.durationInFrames > r0);
  const args: string[] = [];
  const filters: string[] = [];
  const buses: Record<string, string[]> = { dialogue: [], music: [], sfx: [], ambience: [] };
  clips.forEach((c: TLAudioClip, i) => {
    if (c.loop) args.push('-stream_loop', '-1');
    args.push('-i', resolveDataPath(c.src));
    // clip window relative to the render range
    const clipStart = c.startFrame - r0; // may be negative
    const skipFrames = Math.max(0, -clipStart);
    const durFrames = Math.min(c.durationInFrames - skipFrames, r1 - Math.max(c.startFrame, r0) + 1);
    if (durFrames <= 0) return;
    const trim = (c.trimStartFrames + skipFrames) / fps;
    const dur = durFrames / fps;
    const vol = tr[c.track].volume * c.volume;
    const fadeIn = skipFrames ? 0 : c.fadeInFrames / fps;
    const fadeOut = c.fadeOutFrames / fps;
    const delayMs = Math.max(0, Math.round((clipStart / fps) * 1000));
    let f = `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=start=${trim.toFixed(4)}:duration=${dur.toFixed(4)},asetpts=PTS-STARTPTS,volume=${vol.toFixed(3)}`;
    if (fadeIn > 0) f += `,afade=t=in:st=0:d=${fadeIn.toFixed(3)}`;
    if (fadeOut > 0 && dur > fadeOut) f += `,afade=t=out:st=${(dur - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`;
    if (delayMs > 0) f += `,adelay=${delayMs}|${delayMs}`;
    f += `[c${i}]`;
    filters.push(f);
    buses[c.track].push(`[c${i}]`);
  });
  filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${totalSec.toFixed(4)}[base]`);
  const mixInputs = ['[base]'];
  const bus = (name: string, inputs: string[]) => {
    if (!inputs.length) return null;
    if (inputs.length === 1) {
      filters.push(`${inputs[0]}anull[${name}]`);
    } else filters.push(`${inputs.join('')}amix=inputs=${inputs.length}:normalize=0:duration=longest[${name}]`);
    return `[${name}]`;
  };
  const dlg = bus('dlg', buses.dialogue);
  const mus = bus('mus', buses.music);
  const sfx = bus('sfxb', buses.sfx);
  const amb = bus('amb', buses.ambience);
  if (dlg && mus && tr.music.duckUnderDialogue) {
    filters.push(`${dlg}asplit=2[dlgout][dlgsc]`);
    // ratio derived from requested duck amount (dB)
    const ratio = Math.max(2, Math.min(20, tr.music.duckAmountDb / 2));
    filters.push(`[mus][dlgsc]sidechaincompress=threshold=0.02:ratio=${ratio}:attack=30:release=450:makeup=1[musd]`);
    mixInputs.push('[dlgout]', '[musd]');
  } else {
    if (dlg) mixInputs.push(dlg);
    if (mus) mixInputs.push(mus);
  }
  if (sfx) mixInputs.push(sfx);
  if (amb) mixInputs.push(amb);
  filters.push(`${mixInputs.join('')}amix=inputs=${mixInputs.length}:normalize=0:duration=first,alimiter=limit=0.89:level=false,atrim=duration=${totalSec.toFixed(4)}[out]`);
  await ffmpeg([...args, '-filter_complex', filters.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', outWav]);
  return { clips: clips.length, totalSec };
}

export async function audioPeakDb(file: string): Promise<{ maxDb: number; meanDb: number }> {
  const { stderr } = await ffmpeg(['-i', file, '-af', 'volumedetect', '-f', 'null', '-']);
  const max = Number(stderr.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1] ?? NaN);
  const mean = Number(stderr.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1] ?? NaN);
  return { maxDb: max, meanDb: mean };
}

export async function mux(videoPath: string, audioPath: string, outPath: string, durationSec: number) {
  await ffmpeg(['-i', videoPath, '-i', audioPath, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', durationSec.toFixed(4), '-movflags', '+faststart', outPath]);
}

// ---------------------------------------------------------------------------------------------
// Subtitles
// ---------------------------------------------------------------------------------------------

const srtTime = (frame: number, fps: number) => {
  const ms = Math.round((frame / fps) * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
};

export function toSrt(timeline: Timeline, offsetFrames = 0, range?: [number, number]): string {
  const subs = timeline.subtitles.filter((s) => !range || (s.endFrame > range[0] && s.startFrame <= range[1]));
  return subs
    .map((s, i) => {
      const a = Math.max(0, s.startFrame - offsetFrames);
      const b = Math.max(a + 1, s.endFrame - offsetFrames);
      return `${i + 1}\n${srtTime(a, timeline.fps)} --> ${srtTime(b, timeline.fps)}\n${s.speaker ? `${s.speaker}: ` : ''}${s.text}\n`;
    })
    .join('\n');
}
