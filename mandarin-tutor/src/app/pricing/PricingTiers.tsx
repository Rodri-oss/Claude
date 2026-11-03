"use client";
import { useState } from "react";
import { TIERS, type TierId } from "@/data/pricing";
import { WaitlistForm } from "@/components/WaitlistForm";

export function PricingTiers({ signedIn, email }: { signedIn: boolean; email: string }) {
  const [modal, setModal] = useState<TierId | null>(null);

  async function choose(tier: TierId) {
    // record the choice first (fire-and-forget is fine; keepalive survives navigation)
    void fetch("/api/pricing/click", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tier }), keepalive: true });
    if (tier === "free") window.location.assign(signedIn ? "/dashboard" : "/login");
    else setModal(tier);
  }

  const chosen = TIERS.find((t) => t.id === modal);

  return (
    <>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {TIERS.map((t) => {
          const featured = t.id === "pro";
          return (
            <div key={t.id} className={`relative flex flex-col rounded-3xl border bg-card p-6 ${featured ? "border-accent shadow-lg" : "border-line"}`} data-testid={`tier-${t.id}`}>
              {featured && <span className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-0.5 text-xs font-semibold text-accent-ink">Most popular</span>}
              <h2 className="text-lg font-semibold">{t.name}</h2>
              <p className="mt-2">
                <span className="text-4xl font-bold">${t.price}</span>
                <span className="text-muted">/mo</span>
              </p>
              <p className="mt-2 text-sm text-ink-2">{t.blurb}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {t.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-jade" aria-hidden>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => void choose(t.id)}
                className={`mt-6 rounded-xl py-3 font-semibold ${featured ? "bg-accent text-accent-ink" : t.id === "free" ? "border border-line" : "bg-ink text-paper"}`}
              >
                {t.id === "free" ? (signedIn ? "Keep using Free" : "Start free") : `Choose ${t.name}`}
              </button>
            </div>
          );
        })}
      </div>

      {chosen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="soon-title" onClick={() => setModal(null)}>
          <div className="w-full max-w-md rounded-t-3xl bg-paper p-6 shadow-xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-3xl">🚧</p>
            <h2 id="soon-title" className="mt-2 text-xl font-bold">Pro is coming soon. Want early access?</h2>
            <p className="mt-2 text-sm text-ink-2">
              You picked <b>{chosen.name}</b> (${chosen.price}/mo). Paid plans aren&apos;t available yet, and you haven&apos;t been charged. Leave your email and you&apos;ll be first in line.
            </p>
            <div className="mt-4">
              <WaitlistForm source="pricing" tier={chosen.id} defaultEmail={email} cta="Get early access" />
            </div>
            <button onClick={() => setModal(null)} className="mt-4 w-full text-sm text-muted underline">Maybe later</button>
          </div>
        </div>
      )}
    </>
  );
}
