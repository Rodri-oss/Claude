import type { Metadata } from "next";
import { AuthCard } from "@/components/AuthCard";
import { VerifyButton } from "./VerifyButton";

export const metadata: Metadata = { title: "Sign in" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  return (
    <AuthCard>
      <h1 className="text-xl font-bold">Almost there</h1>
      <p className="mt-1 text-sm text-ink-2">Tap the button to finish signing in on this device.</p>
      <VerifyButton token={token} />
    </AuthCard>
  );
}
