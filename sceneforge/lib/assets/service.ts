import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { and, desc, eq, isNull, like, or } from 'drizzle-orm';
import { getDb, schema } from '../db';
import { newId } from '../ids';
import { paths, maxUploadBytes } from '../config';
import { safeName, toDataRel, resolveDataPath, assertDiskSpace } from './storage';
import { probe } from '../media/ffmpeg';

export type Asset = typeof schema.assets.$inferSelect;
type Provenance = Asset['provenance'];

const EXT_KIND: Record<string, { kind: 'image' | 'video' | 'audio' | 'document'; mime: string }> = {
  '.png': { kind: 'image', mime: 'image/png' },
  '.webp': { kind: 'image', mime: 'image/webp' },
  '.jpg': { kind: 'image', mime: 'image/jpeg' },
  '.jpeg': { kind: 'image', mime: 'image/jpeg' },
  '.mp4': { kind: 'video', mime: 'video/mp4' },
  '.webm': { kind: 'video', mime: 'video/webm' },
  '.mov': { kind: 'video', mime: 'video/quicktime' },
  '.wav': { kind: 'audio', mime: 'audio/wav' },
  '.mp3': { kind: 'audio', mime: 'audio/mpeg' },
  '.m4a': { kind: 'audio', mime: 'audio/mp4' },
  '.ogg': { kind: 'audio', mime: 'audio/ogg' },
  '.flac': { kind: 'audio', mime: 'audio/flac' },
  '.txt': { kind: 'document', mime: 'text/plain' },
  '.md': { kind: 'document', mime: 'text/markdown' },
  '.fountain': { kind: 'document', mime: 'text/plain' },
  '.json': { kind: 'document', mime: 'application/json' },
};

export const ALLOWED_EXTENSIONS = Object.keys(EXT_KIND);

export class AssetValidationError extends Error {}

export interface ImportOptions {
  sourcePath: string; // absolute temp file path
  originalName: string;
  category: string;
  projectId?: string | null;
  provenance: Provenance;
  tags?: string[];
  parentAssetId?: string | null;
  /** move instead of copy (for temp files we own) */
  move?: boolean;
}

/** Validate, probe and store a media file. Returns the asset row. Files are content-checked, not just extension-checked. */
export async function importAsset(opts: ImportOptions): Promise<Asset> {
  const ext = path.extname(opts.originalName).toLowerCase();
  const info = EXT_KIND[ext];
  if (!info) throw new AssetValidationError(`Unsupported file type "${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
  const stat = fs.statSync(opts.sourcePath);
  if (stat.size === 0) throw new AssetValidationError('File is empty');
  if (stat.size > maxUploadBytes()) throw new AssetValidationError(`File exceeds ${Math.round(maxUploadBytes() / 1048576)} MB limit`);
  assertDiskSpace(stat.size * 2 + 50 * 1024 * 1024);

  let width: number | null = null;
  let height: number | null = null;
  let durationSec: number | null = null;
  if (info.kind === 'image') {
    try {
      const meta = await sharp(opts.sourcePath).metadata();
      if (!meta.width || !meta.height) throw new Error('no dimensions');
      if (meta.width > 8192 || meta.height > 8192) throw new AssetValidationError('Image dimensions exceed 8192px');
      width = meta.width;
      height = meta.height;
    } catch (e) {
      if (e instanceof AssetValidationError) throw e;
      throw new AssetValidationError('File is not a valid image');
    }
  } else if (info.kind === 'video' || info.kind === 'audio') {
    try {
      const p = await probe(opts.sourcePath);
      if (info.kind === 'video' && !p.video) throw new Error('no video stream');
      if (info.kind === 'audio' && !p.audio) throw new Error('no audio stream');
      durationSec = p.durationSec;
      width = p.video?.width ?? null;
      height = p.video?.height ?? null;
    } catch {
      throw new AssetValidationError(`File is not valid ${info.kind}`);
    }
  } else {
    const head = fs.readFileSync(opts.sourcePath).subarray(0, 4096);
    if (head.includes(0)) throw new AssetValidationError('Document must be plain text');
  }

  const hash = crypto.createHash('sha256').update(fs.readFileSync(opts.sourcePath)).digest('hex');
  const id = newId('ast');
  const root = opts.projectId ? path.join(paths.projects(), opts.projectId, 'assets') : paths.shared();
  const dest = path.join(root, safeName(opts.category), `${id}-${safeName(opts.originalName)}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const staging = `${dest}.part`;
  fs.copyFileSync(opts.sourcePath, staging);
  fs.renameSync(staging, dest);
  if (opts.move) fs.rmSync(opts.sourcePath, { force: true });

  const db = getDb();
  let version = 1;
  let parentAssetId: string | null = null;
  if (opts.parentAssetId) {
    const parent = db.select().from(schema.assets).where(eq(schema.assets.id, opts.parentAssetId)).get();
    if (parent) {
      parentAssetId = parent.parentAssetId ?? parent.id;
      const siblings = db
        .select({ v: schema.assets.version })
        .from(schema.assets)
        .where(or(eq(schema.assets.parentAssetId, parentAssetId), eq(schema.assets.id, parentAssetId)))
        .all();
      version = Math.max(...siblings.map((s) => s.v)) + 1;
    }
  }
  const row = {
    id,
    projectId: opts.projectId ?? null,
    kind: info.kind,
    category: opts.category,
    name: path.basename(opts.originalName),
    path: toDataRel(dest),
    mime: info.mime,
    sizeBytes: stat.size,
    sha256: hash,
    width,
    height,
    durationSec,
    version,
    parentAssetId,
    tags: opts.tags ?? [],
    provenance: opts.provenance,
  };
  db.insert(schema.assets).values(row).run();
  return getAsset(id)!;
}

export function getAsset(id: string): Asset | undefined {
  return getDb().select().from(schema.assets).where(eq(schema.assets.id, id)).get();
}

export function requireAsset(id: string): Asset {
  const a = getAsset(id);
  if (!a) throw new Error(`Asset ${id} not found`);
  return a;
}

export function assetAbsPath(a: Asset | string): string {
  const asset = typeof a === 'string' ? requireAsset(a) : a;
  return resolveDataPath(asset.path);
}

export function listAssets(filter: { q?: string; category?: string; kind?: string; projectId?: string | null; limit?: number } = {}) {
  const db = getDb();
  const conds = [];
  if (filter.category) conds.push(eq(schema.assets.category, filter.category));
  if (filter.kind) conds.push(eq(schema.assets.kind, filter.kind));
  if (filter.projectId === null) conds.push(isNull(schema.assets.projectId));
  else if (filter.projectId) conds.push(eq(schema.assets.projectId, filter.projectId));
  if (filter.q) conds.push(or(like(schema.assets.name, `%${filter.q}%`), like(schema.assets.tags, `%${filter.q}%`)));
  return db
    .select()
    .from(schema.assets)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(schema.assets.createdAt))
    .limit(filter.limit ?? 200)
    .all();
}

export function assetVersions(assetId: string) {
  const a = requireAsset(assetId);
  const root = a.parentAssetId ?? a.id;
  return getDb()
    .select()
    .from(schema.assets)
    .where(or(eq(schema.assets.id, root), eq(schema.assets.parentAssetId, root)))
    .orderBy(schema.assets.version)
    .all();
}
