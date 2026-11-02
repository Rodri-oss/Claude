import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProject } from '@/lib/story/service';
import { allCheckpoints } from '@/lib/approvals/service';
import { listJobs } from '@/lib/jobs/queue';
import { Tabs } from '@/components/nav';
import { Badge } from '@/components/ui';
import { WORKFLOW_STAGES } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STAGE_LABEL: Record<string, string> = { idea: 'Idea', script: 'Script', breakdown: 'Breakdown', characters: 'Character refs', storyboard: 'Storyboard', audio: 'Audio', animation: 'Animation', timeline: 'Timeline', review: 'Final review', export: 'Export' };

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getProject(id);
  if (!p) notFound();
  const cps = allCheckpoints(id);
  const awaiting = listJobs({ projectId: id, states: ['AWAITING_APPROVAL'] }).length;
  const reconcile = listJobs({ projectId: id, states: ['NEEDS_RECONCILIATION'] }).length;
  const stageIdx = WORKFLOW_STAGES.indexOf(p.stage as never);
  const dot = (s: string) => <Badge tone={s}>{s === 'approved' ? '✓' : s === 'stale' ? '!' : '·'}</Badge>;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted">
            <Link href="/" className="hover:text-fg">
              Projects
            </Link>{' '}
            / {p.genre} · {p.aspect} · {p.fps} fps · target {p.targetDurationSec}s
          </div>
          <h1 className="text-xl font-semibold">{p.title}</h1>
        </div>
        <div className="flex gap-2">
          {awaiting ? <Badge tone="AWAITING_APPROVAL">{awaiting} job(s) awaiting approval</Badge> : null}
          {reconcile ? <Badge tone="NEEDS_RECONCILIATION">{reconcile} need reconciliation</Badge> : null}
        </div>
      </div>
      <ol className="flex flex-wrap items-center gap-1 text-[11px]">
        {WORKFLOW_STAGES.map((s, i) => (
          <li key={s} className={`rounded px-2 py-1 ${i < stageIdx ? 'bg-emerald-500/10 text-emerald-300' : i === stageIdx ? 'bg-accent text-black font-semibold' : 'bg-panel2 text-muted'}`}>
            {STAGE_LABEL[s]}
          </li>
        ))}
      </ol>
      <Tabs
        base={`/projects/${id}`}
        tabs={[
          { href: '', label: 'Overview' },
          { href: 'story', label: 'Story', badge: dot(cps.story.state) },
          { href: 'characters', label: 'Characters & Art', badge: dot(cps.art.state) },
          { href: 'storyboard', label: 'Storyboard', badge: dot(cps.storyboard.state) },
          { href: 'audio', label: 'Audio' },
          { href: 'animation', label: 'Animation', badge: awaiting ? <Badge tone="AWAITING_APPROVAL">{awaiting}</Badge> : undefined },
          { href: 'editor', label: 'Editor' },
          { href: 'export', label: 'Review & Export', badge: dot(cps.final.state) },
          { href: 'budget', label: 'Budget' },
        ]}
      />
      <div>{children}</div>
    </div>
  );
}
