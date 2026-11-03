"use client";
import { useState } from "react";

export function WaitlistForm({ source = "landing", tier, defaultEmail = "", cta = "Join the waitlist", onDone }: { source?: "landing" | "pricing"; tier?: string; defaultEmail?: string; cta?: string; onDone?: () => void }) {
  const [email, setEmail] = useState(defaultEmail);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    setError(null);
    const res = await fetch("/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, source, tier }) });
    if (res.ok) {
      setState("done");
      onDone?.();
    } else {
      setError((await res.json()).error ?? "Something went wrong");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <p className="rounded-xl bg-jade-soft px-4 py-3 text-jade" role="status" data-testid="waitlist-done">
        ✓ You&apos;re on the list. We&apos;ll email <b>{email}</b> when there&apos;s news.
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row" aria-label="Waitlist signup">
      <label className="sr-only" htmlFor={`wl-${source}`}>Email</label>
      <input
        id={`wl-${source}`}
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="min-w-0 flex-1 rounded-xl border border-line bg-card px-4 py-3"
      />
      <button disabled={state === "busy"} className="rounded-xl bg-accent px-5 py-3 font-semibold text-accent-ink disabled:opacity-60">
        {state === "busy" ? "Joining…" : cta}
      </button>
      {error && <p className="text-sm text-[var(--t1)] sm:basis-full">{error}</p>}
    </form>
  );
}
