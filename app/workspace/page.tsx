export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../src/auth/supabase-server';

function formatCurrency(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amountMinor / 100);
  } catch {
    return (amountMinor / 100).toFixed(2) + ' ' + currency;
  }
}

export default async function WorkspacePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('company_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (!membership?.company_id) redirect('/workspace/setup');

  const { data: company } = await supabase
    .from('companies')
    .select('id,name')
    .eq('id', membership.company_id)
    .maybeSingle();

  if (!company) redirect('/workspace/setup');

  const [employees, tasks, approvals, leads, reports, finance] = await Promise.all([
    supabase.from('agent_employees')
      .select('id,display_name,role_key,status,description')
      .eq('company_id', company.id)
      .order('created_at'),
    supabase.from('company_tasks')
      .select('id,status,title,created_at')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('approval_requests')
      .select('id,status,title,summary,created_at')
      .eq('company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('leads')
      .select('id,status')
      .eq('company_id', company.id),
    supabase.from('research_reports')
      .select('id')
      .eq('company_id', company.id),
    supabase.from('financial_entries')
      .select('id,entry_type,status,amount_minor,currency')
      .eq('company_id', company.id),
  ]);

  const employeeRows = employees.data ?? [];
  const taskRows = tasks.data ?? [];
  const approvalRows = approvals.data ?? [];
  const leadRows = leads.data ?? [];
  const reportCount = reports.data?.length ?? 0;
  const activeEmployees = employeeRows.filter((employee) => employee.status === 'active');
  const pendingApprovals = approvalRows.filter((request) => request.status === 'pending');
  const revenueByCurrency = (finance.data ?? [])
    .filter((entry) => entry.entry_type === 'revenue' && entry.status === 'verified')
    .reduce<Record<string, number>>((totals, entry) => {
      const currency = entry.currency || 'NGN';
      totals[currency] = (totals[currency] ?? 0) + Number(entry.amount_minor || 0);
      return totals;
    }, {});
  const revenueTotals = Object.entries(revenueByCurrency);

  return (
    <main className="overview">
      <section className="overview-heading">
        <div>
          <p className="overview-eyebrow">COMPANY COMMAND CENTRE</p>
          <h1>Your company, <span>in control.</span></h1>
          <p className="overview-intro">A live view of your AI workforce, opportunities and decisions that need your attention.</p>
        </div>
        <div className="overview-heading-actions">
          <span className="overview-live"><i /> LIVE WORKSPACE</span>
          <Link className="overview-primary-action" href="/workspace/research">＋ Start research</Link>
        </div>
      </section>

      <section className="overview-metrics" aria-label="Company metrics">
        <article className="overview-metric">
          <div className="overview-metric-top"><span>OPPORTUNITIES</span><b>⌕</b></div>
          <strong>{leadRows.length.toLocaleString()}</strong>
          <small>Leads in your company pipeline</small>
        </article>
        <article className="overview-metric">
          <div className="overview-metric-top"><span>ACTIVE AI EMPLOYEES</span><b>✦</b></div>
          <strong>{activeEmployees.length.toLocaleString()}<em> / {employeeRows.length}</em></strong>
          <small>Specialists ready to work</small>
        </article>
        <article className="overview-metric overview-metric-attention">
          <div className="overview-metric-top"><span>OWNER APPROVALS</span><b>✓</b></div>
          <strong>{pendingApprovals.length.toLocaleString()}</strong>
          <small>Decisions waiting for you</small>
        </article>
        <article className="overview-metric">
          <div className="overview-metric-top"><span>RESEARCH REPORTS</span><b>▤</b></div>
          <strong>{reportCount.toLocaleString()}</strong>
          <small>Saved findings and evidence</small>
        </article>
      </section>

      <section className="overview-main-grid">
        <article className="overview-panel overview-workforce-panel">
          <div className="overview-panel-heading">
            <div>
              <p className="overview-eyebrow">YOUR AI TEAM</p>
              <h2>Meet your employees</h2>
              <p>Specialists working across your company.</p>
            </div>
            <Link href="/workspace/agents">Manage team <span>↗</span></Link>
          </div>
          {employeeRows.length ? (
            <div className="overview-employee-list">
              {employeeRows.slice(0, 5).map((employee) => (
                <div className="overview-employee" key={employee.id}>
                  <span className="overview-employee-mark">✦</span>
                  <div className="overview-employee-copy">
                    <strong>{employee.display_name}</strong>
                    <small>{employee.description || employee.role_key.replaceAll('_', ' ')}</small>
                  </div>
                  <span className={employee.status === 'active' ? 'overview-status is-active' : 'overview-status'}>
                    <i /> {employee.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="overview-empty">
              <span>✦</span>
              <strong>Your AI team is ready to be configured.</strong>
              <Link href="/workspace/agents">Set up employees</Link>
            </div>
          )}
        </article>

        <article className="overview-panel overview-approval-panel">
          <div className="overview-panel-heading">
            <div>
              <p className="overview-eyebrow">DECISION CENTRE</p>
              <h2>Needs your approval</h2>
            </div>
            <Link href="/workspace/approvals">Open inbox <span>↗</span></Link>
          </div>
          <div className="overview-approval-count">
            <strong>{pendingApprovals.length}</strong>
            <span>pending decisions</span>
          </div>
          <p className="overview-panel-copy">External messages, publishing and spending stay paused until you explicitly approve them.</p>
          {pendingApprovals.slice(0, 2).map((request) => (
            <div className="overview-approval-item" key={request.id}>
              <span className="overview-approval-mark">!</span>
              <div><strong>{request.title}</strong><small>{request.summary}</small></div>
            </div>
          ))}
          {!pendingApprovals.length ? <p className="overview-no-pending">You are all caught up. No decisions are waiting.</p> : null}
        </article>

        <article className="overview-panel overview-activity-panel">
          <div className="overview-panel-heading">
            <div>
              <p className="overview-eyebrow">COMPANY ACTIVITY</p>
              <h2>Recent agent work</h2>
            </div>
            <Link href="/workspace/agents">View task history <span>↗</span></Link>
          </div>
          {taskRows.length ? (
            <div className="overview-task-list">
              {taskRows.map((task) => (
                <div className="overview-task" key={task.id}>
                  <span className="overview-task-mark">↗</span>
                  <div><strong>{task.title}</strong><small>{new Date(task.created_at).toLocaleString()}</small></div>
                  <span className={'overview-task-status status-' + task.status}>{task.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="overview-empty overview-empty-horizontal">
              <span>↗</span>
              <div><strong>No tasks have been run yet.</strong><small>Give an AI employee a clear first assignment.</small></div>
              <Link href="/workspace/research">Assign first task</Link>
            </div>
          )}
        </article>

        <article className="overview-panel overview-finance-panel">
          <div className="overview-panel-heading">
            <div>
              <p className="overview-eyebrow">VERIFIED FINANCE</p>
              <h2>Revenue recorded</h2>
            </div>
            <Link href="/workspace/finance">Open finance <span>↗</span></Link>
          </div>
          {revenueTotals.length ? (
            <div className="overview-revenue-list">
              {revenueTotals.map(([currency, amount]) => (
                <div className="overview-revenue-row" key={currency}>
                  <span>{currency}</span>
                  <strong>{formatCurrency(amount, currency)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div className="overview-finance-empty">
              <strong>No verified revenue yet</strong>
              <p>Only entries checked and verified by an Owner or Admin appear here.</p>
            </div>
          )}
          <div className="overview-finance-note"><i /> Revenue is shown separately by currency. No exchange rates are assumed.</div>
        </article>
      </section>

      <section className="overview-quick-actions">
        <Link href="/workspace/research"><span>⌕</span><div><strong>Find opportunities</strong><small>Start a new research task</small></div><b>↗</b></Link>
        <Link href="/workspace/agents"><span>✦</span><div><strong>Manage AI employees</strong><small>Review your specialist team</small></div><b>↗</b></Link>
        <Link href="/workspace/crm"><span>♙</span><div><strong>Open customer pipeline</strong><small>Review leads and customers</small></div><b>↗</b></Link>
      </section>

      <footer className="overview-footer">LEADPILOT AI <span>Evidence before action · You remain in control</span></footer>
    </main>
  );
}
