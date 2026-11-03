"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PhoneticToggles } from "./Reading";

const NAV = [
  { href: "/dashboard", label: "Today", icon: "🏠" },
  { href: "/review", label: "Review", icon: "🗂️" },
  { href: "/tones", label: "Tones", icon: "🎵" },
  { href: "/vocab", label: "Words", icon: "📖" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function AppShell({ children, extraNav }: { children: React.ReactNode; extraNav?: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur">
        <Link href="/dashboard" className="flex items-baseline gap-2">
          <span lang="zh-TW" className="han text-lg font-bold text-accent">華語</span>
          <span className="text-sm font-semibold">Taiwan Tutor</span>
        </Link>
        <div className="flex items-center gap-2">
          {extraNav}
          <PhoneticToggles />
        </div>
      </header>
      <main className="flex-1 px-4 pb-28 pt-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 backdrop-blur" aria-label="Main">
        <ul className="mx-auto flex max-w-xl justify-around px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5">
          {NAV.map((n) => {
            const active = path === n.href || path.startsWith(n.href + "/");
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-w-14 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] ${
                    active ? "font-semibold text-accent" : "text-muted"
                  }`}
                >
                  <span aria-hidden className="text-lg leading-none">{n.icon}</span>
                  {n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
