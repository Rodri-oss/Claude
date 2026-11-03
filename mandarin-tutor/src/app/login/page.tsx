import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/server/auth";
import { safeNext } from "@/lib/server/tokens";
import { AuthCard } from "@/components/AuthCard";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getSessionUser()) redirect(next);
  return (
    <AuthCard>
      <h1 className="text-xl font-bold">Sign in or create an account</h1>
      <p className="mt-1 text-sm text-ink-2">We&apos;ll email you a one-time sign-in link. No password needed.</p>
      <LoginForm next={next} />
    </AuthCard>
  );
}
