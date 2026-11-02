import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir, paths } from '../config';

/** Make a user-supplied name safe for use as a filename component. */
export function safeName(name: string, fallback = 'file'): string {
  const base = path.basename(name).normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[-.]+/, '').slice(0, 80);
  return base || fallback;
}

/** Resolve a stored relative path to an absolute path, refusing anything outside the data directory. */
export function resolveDataPath(rel: string): string {
  if (typeof rel !== 'string' || rel.includes('\0')) throw new Error('Invalid path');
  const root = dataDir();
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('Path escapes data directory');
  return abs;
}

export function toDataRel(abs: string): string {
  const root = dataDir();
  const rel = path.relative(root, path.resolve(abs));
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Path outside data directory');
  return rel.split(path.sep).join('/');
}

export function tmpFile(ext: string): string {
  fs.mkdirSync(paths.tmp(), { recursive: true });
  return path.join(paths.tmp(), `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
}

/** Atomically move a finished temp file into place (same filesystem rename; never leaves partial outputs). */
export function finalizeAtomic(tmpPath: string, destAbs: string) {
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  const staging = `${destAbs}.part-${crypto.randomBytes(4).toString('hex')}`;
  fs.copyFileSync(tmpPath, staging);
  fs.renameSync(staging, destAbs);
  fs.rmSync(tmpPath, { force: true });
}

export function writeAtomic(destAbs: string, data: Buffer | string) {
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  const staging = `${destAbs}.part-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(staging, data);
  fs.renameSync(staging, destAbs);
}

export function freeDiskBytes(dir = dataDir()): number | null {
  try {
    const s = fs.statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

export function assertDiskSpace(minBytes: number) {
  const free = freeDiskBytes();
  if (free !== null && free < minBytes) {
    const e = new Error(`Insufficient disk space: ${(free / 1e9).toFixed(2)} GB free, need ${(minBytes / 1e9).toFixed(2)} GB`);
    (e as any).errorClass = 'disk_space';
    throw e;
  }
}
