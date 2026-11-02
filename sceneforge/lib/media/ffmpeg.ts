import { spawn } from 'node:child_process';
import { bins } from '../config';

export class MediaToolError extends Error {
  constructor(message: string, public readonly stderr: string) {
    super(message);
  }
}

export function run(bin: string, args: string[], opts: { timeoutMs?: number; input?: Buffer } = {}): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out: Buffer[] = [];
    let err = '';
    const timer = opts.timeoutMs ? setTimeout(() => p.kill('SIGKILL'), opts.timeoutMs) : null;
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => {
      err += d.toString();
      if (err.length > 200_000) err = err.slice(-100_000);
    });
    p.on('error', (e) => {
      if (timer) clearTimeout(timer);
      reject(new MediaToolError(`${bin} failed to start: ${e.message}`, err));
    });
    p.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr: err });
      else reject(new MediaToolError(`${bin} exited with ${code ?? signal}: ${err.split('\n').filter(Boolean).slice(-4).join(' | ')}`, err));
    });
    if (opts.input) p.stdin.end(opts.input);
    else p.stdin.end();
  });
}

export function ffmpeg(args: string[], timeoutMs = 30 * 60_000) {
  const bin = bins.ffmpeg();
  if (!bin) throw new MediaToolError('FFmpeg not found. Install ffmpeg or set FFMPEG_PATH.', '');
  return run(bin, ['-hide_banner', '-nostdin', '-y', ...args], { timeoutMs });
}

export interface ProbeResult {
  durationSec: number;
  formatName: string;
  sizeBytes: number;
  video: { codec: string; width: number; height: number; fps: number; frames: number | null; pixFmt: string } | null;
  audio: { codec: string; sampleRate: number; channels: number } | null;
}

export async function probe(file: string): Promise<ProbeResult> {
  const bin = bins.ffprobe();
  if (!bin) throw new MediaToolError('ffprobe not found. Install ffmpeg or set FFPROBE_PATH.', '');
  const { stdout } = await run(bin, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeoutMs: 60_000 });
  const j = JSON.parse(stdout.toString());
  const v = (j.streams || []).find((s: any) => s.codec_type === 'video');
  const a = (j.streams || []).find((s: any) => s.codec_type === 'audio');
  const fpsOf = (r: string | undefined) => {
    if (!r) return 0;
    const [n, d] = r.split('/').map(Number);
    return d ? n / d : n;
  };
  return {
    durationSec: Number(j.format?.duration ?? v?.duration ?? a?.duration ?? 0),
    formatName: j.format?.format_name ?? '',
    sizeBytes: Number(j.format?.size ?? 0),
    video: v
      ? { codec: v.codec_name, width: v.width, height: v.height, fps: fpsOf(v.avg_frame_rate || v.r_frame_rate), frames: v.nb_frames ? Number(v.nb_frames) : null, pixFmt: v.pix_fmt }
      : null,
    audio: a ? { codec: a.codec_name, sampleRate: Number(a.sample_rate), channels: a.channels } : null,
  };
}

/** Decode the whole file to null to prove it's playable (no decode errors). */
export async function verifyDecodable(file: string): Promise<{ ok: boolean; errors: string }> {
  const bin = bins.ffmpeg();
  if (!bin) return { ok: false, errors: 'ffmpeg missing' };
  try {
    const { stderr } = await run(bin, ['-v', 'error', '-i', file, '-f', 'null', '-'], { timeoutMs: 20 * 60_000 });
    return { ok: stderr.trim().length === 0, errors: stderr.trim().slice(0, 2000) };
  } catch (e: any) {
    return { ok: false, errors: String(e.message).slice(0, 2000) };
  }
}

/** Decode audio to mono float32 PCM at the given rate. */
export async function decodePcm(file: string, sampleRate = 16000): Promise<Float32Array> {
  const bin = bins.ffmpeg();
  if (!bin) throw new MediaToolError('FFmpeg not found', '');
  const { stdout } = await run(bin, ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', '-'], { timeoutMs: 5 * 60_000 });
  return new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 4));
}
