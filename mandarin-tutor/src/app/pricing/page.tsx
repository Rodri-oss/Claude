import type { Metadata } from "next";
import { getSessionUser } from "@/lib/server/auth";
import { SiteFooter, SiteHeader } from "@/components/SiteHeader";
import { PricingTiers } from "./PricingTiers";

export const metadata: Metadata = { title: "Go Pro" };

export default async function PricingPage() {
  const user = await getSessionUser();
  return (
    <div className="min-h-dvh">
      <SiteHeader signedIn={!!user} />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold sm:text-4xl">Go Pro</h1>
          <p className="mt-3 text-ink-2">Start free. Upgrade when you want the full road from Novice to Band B.</p>
        </div>
        <PricingTiers signedIn={!!user} email={user?.email ?? ""} />
      </main>
      <SiteFooter />
    </div>
  );
}
