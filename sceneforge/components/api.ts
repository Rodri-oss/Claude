'use client';
import type { ActionName } from '@/lib/api/actions';

export class RpcError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

export async function rpc<T = unknown>(action: ActionName, input: unknown = {}): Promise<T> {
  const res = await fetch(`/api/rpc/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  const j = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!j.ok) throw new RpcError(j.error ?? 'Request failed', j.code ?? 'error');
  return j.data as T;
}

export async function uploadFile(file: File, opts: { category: string; projectId?: string | null; tags?: string[] }) {
  const q = new URLSearchParams({ name: file.name, category: opts.category });
  if (opts.projectId) q.set('projectId', opts.projectId);
  if (opts.tags?.length) q.set('tags', opts.tags.join(','));
  const res = await fetch(`/api/upload?${q}`, { method: 'POST', body: file });
  const j = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!j.ok) throw new Error(j.error ?? 'Upload failed');
  return j.data as { id: string; path: string; name: string; kind: string };
}

export { mediaUrl } from '@/lib/media-url';

export function toast(message: string, kind: 'ok' | 'error' = 'ok') {
  window.dispatchEvent(new CustomEvent('sf-toast', { detail: { message, kind } }));
}
