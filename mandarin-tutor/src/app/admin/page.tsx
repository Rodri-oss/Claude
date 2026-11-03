import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser, isAdmin } from "@/lib/server/auth";
import { getAdminData } from "@/lib/server/admin";
import { pct } from "@/lib/metrics";
import { MiniBars } from "@/components/MiniBars";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!isAdmin(user)) notFound();
  const sp = await searchParams;
  const d = await getAdminData(sp.include === "admin");
  const totalClicks = d.pricing.reduce((a, p) => a + p.clicks, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Demand test: admin</h1>
          <p className="text-sm text-muted">
            {d.includeAdmin ? "Including" : "Excluding"} your own account ·{" "}
            <Link className="underline" href={d.includeAdmin ? "/admin" : "/admin?include=admin"}>{d.includeAdmin ? "exclude it" : "include it"}</Link> · days in Taipei time
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <a className="rounded-lg border border-line px-3 py-1.5" href="/api/admin/export?kind=users">Users CSV</a>
          <a className="rounded-lg border border-line px-3 py-1.5" href="/api/admin/export?kind=waitlist">Waitlist CSV</a>
          <a className="rounded-lg border border-line px-3 py-1.5" href="/api/admin/export?kind=survey">Survey CSV</a>
          <Link className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-ink" href="/dashboard">App</Link>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="admin-kpis">
        <Kpi label="Accounts" value={d.totals.users} sub={`+${d.totals.newUsers7d} in last 7 days`} />
        <Kpi label="Waitlist emails" value={d.totals.waitlist} sub={`${d.totals.waitlistFromPricing} from pricing`} />
        <Kpi label="Active today" value={d.totals.dauToday} sub={`7-day avg ${d.totals.dauAvg7.toFixed(1)} · 7-day actives ${d.totals.wau}`} />
        <Kpi label="7-day retention" value={pct(d.retention.d7Rate)} sub={`${d.retention.d7}/${d.retention.eligible} active on day 7`} />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Signups per day" note="accounts created, last 30 days">
          <MiniBars data={d.signups.map((s) => ({ date: s.date, value: s.accounts }))} label="Accounts created per day" unit="signups" />
          <p className="mt-1 text-xs text-muted">Waitlist joins in the same period: {d.signups.reduce((a, s) => a + s.waitlist, 0)}</p>
        </Card>
        <Card title="Daily active users" note="learners who studied that day">
          <MiniBars data={d.dau.map((x) => ({ date: x.date, value: x.users }))} label="Daily active users" unit="users" />
        </Card>
      </div>

      <Card title="Retention" note="day 0 = signup day, in each learner's time zone">
        <div className="mb-3 flex flex-wrap gap-6 text-sm" data-testid="retention">
          <span>D1: <b>{pct(d.retention.d1Rate)}</b></span>
          <span>D7: <b>{pct(d.retention.d7Rate)}</b></span>
          <span>Returned within 7 days: <b>{pct(d.retention.week1Rate)}</b></span>
        </div>
        <Table head={["Signup week", "Users", "D1", "D7", "Back within 7d"]} num={[1, 2, 3, 4]}>
          {d.cohorts.map((c) => (
            <tr key={c.week}>
              <Td>{c.week}</Td><Td num>{c.users}</Td><Td num>{pct(c.d1Rate)}</Td><Td num>{pct(c.d7Rate)}</Td><Td num>{pct(c.week1Rate)}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="Pricing-tier clicks" note="“Go Pro” page; nobody is charged">
        <ul className="mb-4 space-y-2" data-testid="pricing-clicks">
          {d.pricing.map((p) => (
            <li key={p.id} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0">{p.name} <span className="text-muted">${p.price}</span></span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-line/60">
                <div className="h-full rounded-full bg-[var(--s1)]" style={{ width: `${totalClicks ? (p.clicks / totalClicks) * 100 : 0}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right tabular-nums" data-testid={`clicks-${p.id}`}>{p.clicks} {p.clicks === 1 ? "click" : "clicks"}</span>
            </li>
          ))}
        </ul>
        <Table head={["Tier", "Clicks", "Unique visitors", "Early-access emails", "Visitor → email"]} num={[1, 2, 3, 4]}>
          {d.pricing.map((p) => (
            <tr key={p.id}>
              <Td>{p.name} (${p.price}/mo)</Td><Td num>{p.clicks}</Td><Td num>{p.visitors}</Td><Td num>{p.id === "free" ? "—" : p.earlyAccess}</Td>
              <Td num>{p.id === "free" || !p.visitors ? "—" : pct(p.earlyAccess / p.visitors)}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title={`Survey answers (${d.totals.surveys})`} note="shown after a learner's 5th study session">
        <div className="grid gap-5 md:grid-cols-2" data-testid="survey-summary">
          {d.survey.map((q) => {
            const total = q.options.reduce((a, o) => a + o.count, 0);
            return (
              <div key={q.key}>
                <h3 className="mb-2 text-sm font-semibold">{q.question}</h3>
                <ul className="space-y-1.5">
                  {q.options.map((o) => (
                    <li key={o.id} className="flex items-center gap-2 text-xs">
                      <span className="w-40 shrink-0 truncate" title={o.label}>{o.label}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line/60">
                        <div className="h-full rounded-full bg-[var(--s1)]" style={{ width: `${total ? (o.count / total) * 100 : 0}%` }} />
                      </div>
                      <span className="w-14 shrink-0 text-right tabular-nums">{o.count} · {total ? pct(o.count / total) : "—"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="mt-5">
          <Table head={["Date", "Email", "Level", "Why", "Most useful", "Pay / mo", "Comment"]}>
            {d.surveyRows.map((s) => (
              <tr key={s.id}>
                <Td>{fmt(s.createdAt)}</Td><Td>{s.email}</Td><Td>{s.level}</Td><Td>{s.reason}{s.reasonOther ? `: ${s.reasonOther}` : ""}</Td><Td>{s.mostUseful}</Td><Td>{s.wtp}</Td><Td>{s.comment ?? ""}</Td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Recent accounts">
          <Table head={["Email", "Joined", "Last seen", "Sessions", "Active days"]} num={[3, 4]}>
            {d.users.map((u) => (
              <tr key={u.email}><Td>{u.email}</Td><Td>{fmt(u.createdAt)}</Td><Td>{fmt(u.lastSeenAt)}</Td><Td num>{u.sessions}</Td><Td num>{u.activeDays}</Td></tr>
            ))}
          </Table>
        </Card>
        <Card title="Waitlist">
          <Table head={["Email", "Joined", "Source", "Tier"]}>
            {d.waitlist.map((w) => (
              <tr key={w.id}><Td>{w.email}</Td><Td>{fmt(w.createdAt)}</Td><Td>{w.source}</Td><Td>{w.tier ?? ""}</Td></tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="text-xs text-ink-2">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {note && <span className="text-xs text-muted">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Table({ head, children, num = [] }: { head: string[]; children: React.ReactNode; num?: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead><tr className="border-b border-line text-muted">{head.map((h, i) => <th key={h} className={`whitespace-nowrap px-2 py-1.5 font-medium ${num.includes(i) ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, num }: { children: React.ReactNode; num?: boolean }) {
  return <td className={`px-2 py-1.5 align-top ${num ? "text-right tabular-nums" : ""} ${typeof children === "string" && /^\d{4}-\d\d-\d\d$/.test(children) ? "whitespace-nowrap" : ""}`}>{children}</td>;
}
