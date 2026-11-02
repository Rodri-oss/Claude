/** Serves stored media (read-only) with HTTP Range support. Only project/shared/export media — never the DB. */
import fs from 'node:fs';
import path from 'node:path';

/** fs stream → web stream that tolerates client aborts (seeking video closes connections early). */
function web(s: fs.ReadStream): ReadableStream<Uint8Array> {
  let closed = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      s.on('data', (chunk) => {
        if (closed) return;
        try {
          controller.enqueue(new Uint8Array(chunk as Buffer));
        } catch {
          closed = true;
          s.destroy();
        }
      });
      s.on('end', () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {}
      });
      s.on('error', (e) => {
        if (closed) return;
        closed = true;
        try {
          controller.error(e);
        } catch {}
      });
    },
    cancel() {
      closed = true;
      s.destroy();
    },
  });
}
import { resolveDataPath } from '@/lib/assets/storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MIME: Record<string, string> = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.srt': 'text/plain; charset=utf-8', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
const ALLOWED_ROOTS = ['projects', 'shared-assets', 'exports'];

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const parts = (await ctx.params).path;
  if (!parts.length || !ALLOWED_ROOTS.includes(parts[0])) return new Response('Not found', { status: 404 });
  let abs: string;
  try {
    abs = resolveDataPath(parts.join('/'));
  } catch {
    return new Response('Bad path', { status: 400 });
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return new Response('Not found', { status: 404 });
  const ext = path.extname(abs).toLowerCase();
  const type = MIME[ext];
  if (!type) return new Response('Forbidden', { status: 403 });
  const size = fs.statSync(abs).size;
  const headers: Record<string, string> = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=60' };
  if (new URL(req.url).searchParams.has('download')) headers['Content-Disposition'] = `attachment; filename="${path.basename(abs)}"`;
  const m = req.headers.get('range')?.match(/bytes=(\d*)-(\d*)/);
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(size - 1, Number(m[2])) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    const stream = web(fs.createReadStream(abs, { start, end }));
    return new Response(stream, { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
  }
  return new Response(web(fs.createReadStream(abs)), { headers: { ...headers, 'Content-Length': String(size) } });
}
