import './globals.css';
import type { Metadata } from 'next';
import { NavLink } from '@/components/nav';
import { Toasts } from '@/components/ui';
import { allowPaidProviders } from '@/lib/config';

export const metadata: Metadata = { title: 'SceneForge AI', description: '2D animation production studio' };

const SECTIONS: { title: string; links: [string, string][] }[] = [
  { title: 'Projects', links: [['/', 'All projects'], ['/projects/new', 'New project'], ['/series', 'Series & episodes'], ['/templates', 'Templates']] },
  { title: 'Library', links: [['/characters', 'Characters'], ['/environments', 'Environments'], ['/assets', 'Assets']] },
  { title: 'Production', links: [['/jobs', 'Jobs'], ['/budget', 'Budget'], ['/settings', 'Settings']] },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const paid = allowPaidProviders();
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <div className="flex min-h-screen">
          <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-line bg-panel px-3 py-4">
            <div className="mb-5 px-2">
              <div className="text-lg font-bold tracking-tight">
                Scene<span className="text-accent">Forge</span> AI
              </div>
              <div className="text-[11px] text-muted">2D animation studio</div>
            </div>
            <nav className="flex-1 space-y-4 overflow-y-auto">
              {SECTIONS.map((s) => (
                <div key={s.title}>
                  <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted/70">{s.title}</div>
                  {s.links.map(([href, label]) => (
                    <NavLink key={href} href={href} exact={href === '/'}>
                      {label}
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
            <div className={`mt-3 rounded-md border px-2 py-1.5 text-[11px] ${paid ? 'border-red-500/40 text-red-300' : 'border-emerald-500/30 text-emerald-300'}`}>
              {paid ? 'Paid providers ENABLED' : 'Mock mode — no paid calls'}
            </div>
          </aside>
          <main className="min-w-0 flex-1 px-6 py-5">{children}</main>
        </div>
        <Toasts />
      </body>
    </html>
  );
}
