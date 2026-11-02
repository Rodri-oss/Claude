'use client';
import React, { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { rpc, toast, uploadFile, type RpcError } from './api';
import type { ActionName } from '@/lib/api/actions';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

const VARIANTS = {
  primary: 'bg-accent text-black hover:brightness-110',
  secondary: 'bg-panel2 text-fg border border-line hover:border-accent/60',
  danger: 'bg-red-600/90 text-white hover:bg-red-500',
  ghost: 'text-muted hover:text-fg hover:bg-panel2',
  success: 'bg-emerald-600 text-white hover:bg-emerald-500',
} as const;

export function Button({ variant = 'secondary', size = 'md', className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS; size?: 'sm' | 'md' }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        VARIANTS[variant],
        className,
      )}
    />
  );
}

/** A button that calls an RPC action, shows progress/errors, then refreshes server data. */
export function ActionButton({
  action,
  input,
  children,
  confirm,
  onDone,
  success,
  refresh = true,
  ...rest
}: {
  action: ActionName;
  input?: unknown | (() => unknown);
  children: React.ReactNode;
  confirm?: string;
  onDone?: (data: unknown) => void;
  success?: string;
  refresh?: boolean;
} & Omit<React.ComponentProps<typeof Button>, 'onClick'>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  return (
    <Button
      {...rest}
      disabled={busy || rest.disabled}
      onClick={async () => {
        if (confirm && !window.confirm(confirm)) return;
        setBusy(true);
        try {
          const data = await rpc(action, typeof input === 'function' ? (input as () => unknown)() : input ?? {});
          if (success) toast(success);
          onDone?.(data);
          if (refresh) start(() => router.refresh());
        } catch (e) {
          toast((e as RpcError).message, 'error');
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Spinner /> : null}
      {children}
    </Button>
  );
}

export function Spinner() {
  return <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

export function Card({ title, actions, children, className }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-lg border border-line bg-panel', className)}>
      {title || actions ? (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold tracking-wide text-fg">{title}</h2>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

const BADGE: Record<string, string> = {
  approved: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  COMPLETED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  stale: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  pending: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  none: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  candidate: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  rejected: 'bg-red-500/15 text-red-300 border-red-500/30',
  FAILED: 'bg-red-500/15 text-red-300 border-red-500/30',
  failed: 'bg-red-500/15 text-red-300 border-red-500/30',
  CANCELLED: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  NEEDS_RECONCILIATION: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  AWAITING_APPROVAL: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  QUEUED: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  SUBMITTED: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  RUNNING: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  locked: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  mock: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  A: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  B: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  C: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
};

export function Badge({ tone, children, title }: { tone?: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium', BADGE[tone ?? String(children)] ?? 'border-line bg-panel2 text-muted')}>
      {children}
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-muted/80">{hint}</span> : null}
    </label>
  );
}

export const inputCls = 'w-full rounded-md border border-line bg-panel2 px-2.5 py-1.5 text-sm text-fg outline-none focus:border-accent';

export function Toasts() {
  const [items, setItems] = useState<{ id: number; message: string; kind: string }[]>([]);
  const n = useRef(0);
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail;
      const id = ++n.current;
      setItems((x) => [...x, { id, ...d }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), d.kind === 'error' ? 9000 : 3500);
    };
    window.addEventListener('sf-toast', h);
    return () => window.removeEventListener('sf-toast', h);
  }, []);
  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-md flex-col gap-2">
      {items.map((t) => (
        <div key={t.id} className={cx('rounded-md border px-3 py-2 text-sm shadow-lg', t.kind === 'error' ? 'border-red-500/50 bg-red-950 text-red-200' : 'border-emerald-500/40 bg-emerald-950 text-emerald-200')}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

/** File picker that uploads then calls onUploaded (e.g. to attach as a variant/layer/replacement). */
export function UploadButton({ category, projectId, accept, label = 'Upload', onUploaded, tags, size }: { category: string; projectId?: string | null; accept?: string; label?: string; onUploaded?: (asset: { id: string; path: string; name: string }) => Promise<unknown> | void; tags?: string[]; size?: 'sm' | 'md' }) {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setBusy(true);
          try {
            const a = await uploadFile(f, { category, projectId, tags });
            await onUploaded?.(a);
            toast(`Uploaded ${a.name}`);
            router.refresh();
          } catch (err) {
            toast((err as Error).message, 'error');
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button size={size} onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Spinner /> : null}
        {label}
      </Button>
    </>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{children}</div>;
}

export { fmtUsd, fmtSec } from '@/lib/format';
