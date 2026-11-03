import { getCurrentUser } from "@/lib/server/user";
import { PrefsProvider } from "@/components/Prefs";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <PrefsProvider initial={{ showPinyin: user.showPinyin, showZhuyin: user.showZhuyin }} timezone={user.timezone}>
      <AppShell>{children}</AppShell>
    </PrefsProvider>
  );
}
