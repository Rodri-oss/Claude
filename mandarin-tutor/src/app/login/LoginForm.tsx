"use client";
import { useState } from "react";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const res = await fetch("/api/auth/request", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, next }) });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      setState("idle");
      return;
    }
    setDevLink(data.devLink ?? null);
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div className="mt-5 space-y-3" data-testid="login-sent">
        <p className="rounded-xl bg-jade-soft p-3 text-sm text-jade">
          ✉️ Check <b>{email}</b> for your sign-in link. It expires in 15 minutes.
        </p>
        {devLink && (
          <p className="rounded-xl bg-warn-soft p-3 text-sm">
            Dev mode (no email provider configured):{" "}
            <a href={devLink} className="font-semibold text-accent underline" data-testid="dev-link">open the sign-in link</a>
          </p>
        )}
        <button className="text-sm text-muted underline" onClick={() => setState("idle")}>Use a different email</button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="mt-5 space-y-3">
      <label className="block">
        <span className="text-sm font-medium">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2.5"
          placeholder="you@example.com"
        />
      </label>
      {error && <p className="text-sm text-[var(--t1)]">{error}</p>}
      <button disabled={state === "sending"} className="w-full rounded-xl bg-accent py-3 font-semibold text-accent-ink disabled:opacity-60">
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
