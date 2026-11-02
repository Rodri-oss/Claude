/**
 * Streaming upload: POST raw file bytes with ?name=&category=&projectId=.
 * Enforces the size limit while streaming, validates content, and stores via the asset service.
 */
import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { importAsset, AssetValidationError, ALLOWED_EXTENSIONS } from '@/lib/assets/service';
import { tmpFile, safeName } from '@/lib/assets/storage';
import { maxUploadBytes } from '@/lib/config';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CATEGORIES = ['character', 'background', 'prop', 'dialogue', 'music', 'sfx', 'ambience', 'video', 'still', 'reference', 'document'];

export async function POST(req: Request) {
  const url = new URL(req.url);
  const name = safeName(url.searchParams.get('name') ?? 'upload');
  const category = url.searchParams.get('category') ?? 'reference';
  const projectId = url.searchParams.get('projectId') || null;
  const tags = (url.searchParams.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 10);
  if (!CATEGORIES.includes(category)) return NextResponse.json({ ok: false, error: 'Invalid category' }, { status: 400 });
  if (!ALLOWED_EXTENSIONS.includes(path.extname(name).toLowerCase())) return NextResponse.json({ ok: false, error: `Unsupported type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` }, { status: 400 });
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > maxUploadBytes()) return NextResponse.json({ ok: false, error: 'File too large' }, { status: 413 });
  if (!req.body) return NextResponse.json({ ok: false, error: 'Empty body' }, { status: 400 });
  const tmp = tmpFile(path.extname(name));
  const out = fs.createWriteStream(tmp);
  let size = 0;
  try {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxUploadBytes()) throw new AssetValidationError('File too large');
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
    }
    await new Promise<void>((r, j) => out.end((e: unknown) => (e ? j(e) : r())));
    const asset = await importAsset({ sourcePath: tmp, originalName: name, category, projectId, provenance: { source: 'import', note: 'User upload' }, tags, move: true });
    return NextResponse.json({ ok: true, data: asset });
  } catch (e) {
    out.destroy();
    fs.rmSync(tmp, { force: true });
    const status = e instanceof AssetValidationError ? 400 : 500;
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status });
  }
}
