"use client";
import Link from "next/link";
import { useState } from "react";

export function VerifyButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "error">(token ? "idle" : "error");
  const [error, setError] = useState(token ? "" : "This sign-in link is incomplete.");

  async function go() {
    setState("busy");
    const res = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
    const data = await res.json();
    if (res.ok) window.location.assign(data.next);
    else {
      setError(data.error);
      setState("error");
    }
  }

  if (state === "error") {
    return (
      <div className="mt-5 space-y-3">
        <p className="rounded-xl bg-accent-soft p-3 text-sm text-accent" role="alert">{error}</p>
        <Link href="/login" className="block w-full rounded-xl border border-line py-3 text-center font-semibold">Request a new link</Link>
      </div>
    );
  }
  return (
    <button onClick={go} disabled={state === "busy"} className="mt-5 w-full rounded-xl bg-accent py-3 font-semibold text-accent-ink disabled:opacity-60">
      {state === "busy" ? "Signing in…" : "Sign in"}
    </button>
  );
}
