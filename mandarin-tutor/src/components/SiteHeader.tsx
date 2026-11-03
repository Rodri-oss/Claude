import Link from "next/link";

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span lang="zh-TW" className="han text-lg font-bold text-accent">華語</span>
          <span className="text-sm font-semibold">Taiwan Tutor</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/pricing" className="rounded-lg px-3 py-1.5 text-ink-2 hover:text-ink">Pricing</Link>
          {signedIn ? (
            <Link href="/dashboard" className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-ink">Open app</Link>
          ) : (
            <>
              <Link href="/login" className="rounded-lg px-3 py-1.5 text-ink-2 hover:text-ink">Sign in</Link>
              <Link href="/login" className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-ink">Start free</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted">
        <span>
          <span lang="zh-TW" className="han">華語</span> Taiwan Tutor: learn Mandarin for life in Taiwan.
        </span>
        <span className="flex gap-4">
          <Link href="/pricing">Pricing</Link>
          <Link href="/login">Sign in</Link>
        </span>
      </div>
    </footer>
  );
}
