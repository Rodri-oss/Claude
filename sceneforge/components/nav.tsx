'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from './ui';

export function NavLink({ href, children, exact }: { href: string; children: React.ReactNode; exact?: boolean }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(href + '/');
  return (
    <Link href={href} className={cx('block rounded-md px-3 py-1.5 text-sm transition', active ? 'bg-panel2 text-accent' : 'text-muted hover:bg-panel2 hover:text-fg')}>
      {children}
    </Link>
  );
}

export function Tabs({ base, tabs }: { base: string; tabs: { href: string; label: string; badge?: React.ReactNode }[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => {
        const href = t.href ? `${base}/${t.href}` : base;
        const active = t.href ? path.startsWith(href) : path === base;
        return (
          <Link key={t.label} href={href} className={cx('-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm', active ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}>
            {t.label}
            {t.badge}
          </Link>
        );
      })}
    </nav>
  );
}
