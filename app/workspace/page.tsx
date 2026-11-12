export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../src/auth/supabase-server';
import WorkspaceGreeting from '../../components/workspace-greeting';
import { aggregateVerifiedFinance } from '../../src/workspace/finance';
import { averageScore, bucketByWeek, chartPoints, displayNameFrom, isVerifiedLead, leadTier, weekOverWeek } from '../../src/workspace/dashboard-data';

function formatCurrency(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amountMinor / 100);
  } catch {
    return (amountMinor / 100).toFixed(2) + ' ' + currency;
  }
}

function timeAgo(value: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(value)) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

type BusinessRef = { name?: string | null; city?: string | null; country?: string | null };
const pickBusiness = (value: BusinessRef | BusinessRef[] | null | undefined): BusinessRef => (Array.isArray(value) ? value[0] : value) ?? {};

function Delta({ change }: { change: number | null }) {
  if (change === null) return <em className="dash-delta is-flat">no prior week</em>;
  return (
    <em className={change >= 0 ? 'dash-delta is-up' : 'dash-delta is-down'}>
      {change >= 0 ? '↑' : '↓'} {Math.abs(change)}% vs last week
    </em>
  );
}

export default async function WorkspacePage(props: { searchParams: Promise<{ warning?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase.from('company_memberships').select('company_id').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
  if (!membership?.company_id) redirect('/workspace/setup');

  const { data: company } = await supabase.from('companies').select('id,name').eq('id', membership.company_id).maybeSingle();
  if (!company) redirect('/workspace/setup');
  const companyId = company.id as string;

  const head = (table: string) => supabase.from(table).select('id', { count: 'exact', head: true }).eq('company_id', companyId);

  const [profile, employees, tasks, runningTasks, failedTasks, pending, pendingList, leadCount, leads, reports, finance, events] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
    supabase.from('agent_employees').select('id,display_name,role_key,status,description').eq('company_id', companyId).order('created_at'),
    supabase.from('company_tasks').select('id,status,title,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(6),
    head('company_tasks').eq('status', 'running'),
    head('company_tasks').eq('status', 'failed'),
    head('approval_requests').eq('status', 'pending'),
    supabase.from('approval_requests').select('id,title,summary').eq('company_id', companyId).eq('status', 'pending').order('created_at', { ascending: false }).limit(2),
    head('leads'),
    supabase.from('leads').select('id,status,score,score_label,reliability_confidence,created_at,updated_at,businesses(name,city,country)').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1000),
    head('research_reports'),
    supabase.from('financial_entries').select('entry_type,status,amount_minor,currency').eq('company_id', companyId).limit(1000),
    supabase.from('activity_events').select('id,summary,event_type,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(6),
  ]);

  const loadFailed = [employees, tasks, runningTasks, failedTasks, pending, pendingList, leadCount, leads, reports, finance, events].some((result) => result.error);

  const now = new Date();
  const nowMs = now.getTime();
  const employeeRows = employees.data ?? [];
  const leadRows = leads.data ?? [];
  const totalLeads = leadCount.count ?? leadRows.length;
  const verifiedLeads = leadRows.filter(isVerifiedLead).length;
  const customers = leadRows.filter((row) => row.status === 'CUSTOMER');
  const growth = weekOverWeek(leadRows.map((row) => row.created_at), now);
  const quality = averageScore(leadRows);
  const highQuality = leadRows.filter((row) => Number(row.score) >= 70).length;
  const topLeads = [...leadRows].filter((row) => Number(row.score) > 0).sort((a, b) => Number(b.score) - Number(a.score)).slice(0, 3);
  const revenueTotals = Object.entries(aggregateVerifiedFinance(finance.data ?? [])).filter(([, totals]) => totals.revenue > 0);
  const activeEmployees = employeeRows.filter((employee) => employee.status === 'active').length;

  const leadsByWeek = bucketByWeek(leadRows.map((row) => row.created_at), now);
  const wonByWeek = bucketByWeek(customers.map((row) => row.updated_at ?? row.created_at), now);
  const [leadsLine, wonLine] = chartPoints([leadsByWeek.map((b) => b.count), wonByWeek.map((b) => b.count)], 560, 200);
  const hasChartData = leadsByWeek.some((b) => b.count > 0);

  const feed = [
    ...(tasks.data ?? []).map((task) => ({ key: 'task-' + task.id, title: task.title as string, meta: String(task.status), at: task.created_at as string })),
    ...(events.data ?? []).map((event) => ({ key: 'event-' + event.id, title: event.summary as string, meta: String(event.event_type).replaceAll('_', ' '), at: event.created_at as string })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 6);

  const name = displayNameFrom(profile.data?.display_name, user.email);
  const circumference = 2 * Math.PI * 52;

  return (
    <main className="dash">
      {searchParams.warning ? <p className="dash-banner is-warning" role="status">{searchParams.warning}</p> : null}
      {loadFailed ? <p className="dash-banner is-danger" role="alert">Some dashboard data could not be loaded. Figures below may be incomplete. Refresh to try again.</p> : null}

      <section className="dash-hero">
        <div>
          <WorkspaceGreeting name={name} />
          <p>Your AI Business Command Centre for {company.name} is ready to help you grow.</p>
        </div>
        <Link className="dash-primary" href="/workspace/research">＋ Start research</Link>
      </section>

      <section className="dash-kpis" aria-label="Key figures">
        <article className="dash-kpi">
          <span className="dash-kpi-icon is-violet">♙</span>
          <div><small>Total leads</small><strong>{totalLeads.toLocaleString()}</strong><Delta change={growth.change} /></div>
        </article>
        <article className="dash-kpi">
          <span className="dash-kpi-icon is-green">✓</span>
          <div><small>Verified leads</small><strong>{verifiedLeads.toLocaleString()}</strong><em className="dash-delta is-flat">reliability 70+</em></div>
        </article>
        <article className="dash-kpi">
          <span className="dash-kpi-icon is-amber">▤</span>
          <div><small>Research reports</small><strong>{(reports.count ?? 0).toLocaleString()}</strong><em className="dash-delta is-flat">saved findings</em></div>
        </article>
        <article className="dash-kpi">
          <span className="dash-kpi-icon is-lime">$</span>
          <div>
            <small>Verified revenue</small>
            {revenueTotals.length ? revenueTotals.map(([currency, totals]) => <strong key={currency}>{formatCurrency(totals.revenue, currency)}</strong>) : <strong>—</strong>}
            <em className="dash-delta is-flat">{revenueTotals.length ? 'checked by Owner or Admin' : 'nothing verified yet'}</em>
          </div>
        </article>
      </section>

      <section className="dash-grid">
        <article className="dash-panel dash-chart">
          <header><h2>Business performance</h2><span className="dash-pill">Last 5 weeks</span></header>
          {hasChartData ? (
            <>
              <div className="dash-legend"><span className="is-blue">Leads added</span><span className="is-green">Customers won</span></div>
              <svg viewBox="0 0 560 200" role="img" aria-label="Leads added and customers won per week" preserveAspectRatio="none">
                {[0, 1, 2, 3].map((line) => <line key={line} x1="0" x2="560" y1={8 + line * 61} y2={8 + line * 61} className="dash-grid-line" />)}
                <polyline points={leadsLine} className="dash-line is-blue" />
                <polyline points={wonLine} className="dash-line is-green" />
              </svg>
              <div className="dash-axis">{leadsByWeek.map((bucket) => <span key={bucket.label}>{bucket.label}</span>)}</div>
            </>
          ) : (
            <div className="dash-empty"><strong>No lead activity yet</strong><small>Add or discover leads and your weekly trend appears here.</small></div>
          )}
        </article>

        <article className="dash-panel">
          <header><h2>AI workforce</h2><Link href="/workspace/agents">Manage all →</Link></header>
          {employeeRows.length ? (
            <div className="dash-employees">
              {employeeRows.slice(0, 4).map((employee) => (
                <div key={employee.id} className="dash-employee">
                  <b>{employee.display_name}</b>
                  <span className={employee.status === 'active' ? 'is-active' : 'is-paused'}>● {employee.status === 'active' ? 'Active' : 'Paused'}</span>
                  <small>{employee.description}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="dash-empty"><strong>Your AI team is not set up</strong><Link href="/workspace/agents">Set up employees</Link></div>
          )}
          <p className="dash-foot">{activeEmployees} of {employeeRows.length} employees active · {runningTasks.count ?? 0} running · {failedTasks.count ?? 0} failed</p>
        </article>

        <article className="dash-panel">
          <header><h2>Recent activity</h2><Link href="/workspace/agents">View all →</Link></header>
          {feed.length ? (
            <ul className="dash-feed">
              {feed.map((item) => (
                <li key={item.key}>
                  <div><b>{item.title}</b><small>{item.meta}</small></div>
                  <time>{timeAgo(item.at, nowMs)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <div className="dash-empty"><strong>No activity yet</strong><small>Tasks and decisions will be listed here.</small></div>
          )}
        </article>

        <article className="dash-panel">
          <header><h2>Lead intelligence</h2><Link href="/workspace/leads">View more →</Link></header>
          {quality === null ? (
            <div className="dash-empty"><strong>No scored leads yet</strong><small>Run the Lead Researcher to start scoring.</small></div>
          ) : (
            <div className="dash-quality">
              <svg viewBox="0 0 120 120" role="img" aria-label={`Average lead score ${quality} out of 100`}>
                <circle cx="60" cy="60" r="52" className="dash-ring-track" />
                <circle cx="60" cy="60" r="52" className="dash-ring" strokeDasharray={`${(quality / 100) * circumference} ${circumference}`} transform="rotate(-90 60 60)" />
                <text x="60" y="58" textAnchor="middle" className="dash-ring-value">{quality}</text>
                <text x="60" y="76" textAnchor="middle" className="dash-ring-label">avg score</text>
              </svg>
              <dl>
                <div><dt>{highQuality}</dt><dd>High-quality leads (70+)</dd></div>
                <div><dt>{customers.length}</dt><dd>Customers won</dd></div>
                <div><dt>{leadRows.filter((row) => row.status === 'NEW').length}</dt><dd>New, not yet worked</dd></div>
              </dl>
            </div>
          )}
        </article>

        <article className="dash-panel">
          <header><h2>Top leads</h2><Link href="/workspace/crm">View all →</Link></header>
          {topLeads.length ? (
            <ul className="dash-top">
              {topLeads.map((lead) => {
                const business = pickBusiness(lead.businesses as BusinessRef | BusinessRef[] | null);
                const tier = leadTier(lead.score);
                return (
                  <li key={lead.id}>
                    <div><b>{business.name ?? 'Unnamed business'}</b><small>{[business.city, business.country].filter(Boolean).join(', ') || 'Location not listed'}</small></div>
                    <strong>{lead.score}</strong>
                    <span className={'dash-tier is-' + tier.toLowerCase()}>{tier}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="dash-empty"><strong>No scored leads yet</strong><Link href="/workspace/crm">Add a lead</Link></div>
          )}
        </article>

        <article className="dash-panel dash-approvals">
          <header><h2>Needs your approval</h2><Link href="/workspace/approvals">Open inbox →</Link></header>
          <p className="dash-count"><strong>{pending.count ?? 0}</strong> pending decisions</p>
          {(pendingList.data ?? []).map((request) => (
            <div key={request.id} className="dash-approval"><b>{request.title}</b><small>{request.summary}</small></div>
          ))}
          {!(pending.count ?? 0) ? <p className="dash-foot">You are all caught up. External messages, publishing and spending always wait for you.</p> : null}
        </article>
      </section>
    </main>
  );
}
