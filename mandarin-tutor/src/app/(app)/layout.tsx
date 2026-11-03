import Link from "next/link";
import { requireUser, isAdmin } from "@/lib/server/auth";
import { PrefsProvider } from "@/components/Prefs";
import { AppShell } from "@/components/AppShell";
import { SurveyGate } from "@/components/SurveyGate";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <PrefsProvider initial={{ showPinyin: user.showPinyin, showZhuyin: user.showZhuyin }} timezone={user.timezone}>
      <AppShell
        extraNav={
          isAdmin(user) ? (
            <Link href="/admin" className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-2">Admin</Link>
          ) : null
        }
      >
        {children}
      </AppShell>
      <SurveyGate />
    </PrefsProvider>
  );
}
