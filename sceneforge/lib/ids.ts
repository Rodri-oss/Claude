import crypto from 'node:crypto';

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function sha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/** Stable JSON stringify (sorted keys) for hashing. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`;
}

export function hashOf(v: unknown): string {
  return sha256(stableStringify(v)).slice(0, 32);
}

export const nowIso = () => new Date().toISOString();
export const currentMonth = (d = new Date()) => d.toISOString().slice(0, 7);
