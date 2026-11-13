export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../../src/auth/supabase-server';
import { averageScore, isVerifiedLead, leadTier } from '../../../src/workspace/dashboard-data';

type BusinessRef = { name?: string | null; city?: string | null; country?: string | null; website?: string | null; industry?: string | null };

export default async function LeadIntelligence(props: { searchParams: Promise<{ q?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase.from('company_memberships').select('company_id').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
  if (!membership?.company_id) redirect('/workspace/setup');

  const { data, error } = await supabase
    .from('leads')
    .select('id,status,score,reliability_confidence,recommendation,created_at,businesses(name,city,country,website,industry)')
    .eq('company_id', membership.company_id)
    .order('score', { ascending: false })
    .limit(300);

  const term = (searchParams.q ?? '').trim().toLowerCase().slice(0, 80);
  const rows = (data ?? []).map((row) => {
    const business: BusinessRef = (Array.isArray(row.businesses) ? row.businesses[0] : row.businesses) ?? {};
    return { ...row, business };
  });
  const visible = term
    ? rows.filter((row) => [row.business.name, row.business.city, row.business.country, row.business.industry].some((value) => (value ?? '').toLowerCase().includes(term)))
    : rows;

  const tiers = { Hot: 0, Good: 0, Medium: 0, Low: 0 };
  for (const row of rows) tiers[leadTier(row.score)] += 1;
  const average = averageScore(rows);

  return (
    <main className="lead-intel">
      <header>
        <p className="li-eyebrow">LEAD INTELLIGENCE</p>
        <h1>Who to contact first</h1>
        <p className="li-muted">Leads ranked by score. Search from the top bar to filter by business, city or country.</p>
      </header>

      {error ? <p role="alert" className="li-error">Could not load leads. Refresh to try again.</p> : null}

      <section className="li-stats">
        <div><strong>{rows.length}</strong><span>Total leads</span></div>
        <div><strong>{average ?? '—'}</strong><span>Average score</span></div>
        <div><strong>{rows.filter((row) => isVerifiedLead(row)).length}</strong><span>Verified (70+)</span></div>
        <div><strong>{tiers.Hot + tiers.Good}</strong><span>Hot or good</span></div>
      </section>

      {term ? <p className="li-muted">Showing {visible.length} of {rows.length} for “{searchParams.q}”. <Link href="/workspace/leads">Clear</Link></p> : null}

      {visible.length ? (
        <div className="li-list">
          {visible.map((row) => {
            const tier = leadTier(row.score);
            return (
              <article key={row.id}>
                <div className="li-main">
                  <b>{row.business.name ?? 'Unnamed business'}</b>
                  <small>{[row.business.industry, row.business.city, row.business.country].filter(Boolean).join(' · ') || 'Details not listed'}</small>
                  {row.recommendation ? <p>{row.recommendation}</p> : null}
                </div>
                <strong className="li-score">{row.score}</strong>
                <span className={'dash-tier is-' + tier.toLowerCase()}>{tier}</span>
                <i>{row.status}</i>
                {row.business.website ? <a href={row.business.website} target="_blank" rel="noreferrer">Website ↗</a> : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="dash-empty"><strong>{term ? 'No leads match that search' : 'No leads yet'}</strong><Link href="/workspace/research">Run the Lead Researcher</Link></div>
      )}

      <style>{`
        .lead-intel{display:grid;gap:18px;color:var(--ws-text)}
        .li-eyebrow{margin:0;color:var(--ws-accent);font-size:10px;letter-spacing:.16em;font-weight:800}
        .lead-intel h1{margin:6px 0;font-size:34px}
        .li-muted{margin:0;color:var(--ws-muted);font-size:13px}.li-muted a{color:var(--ws-accent)}
        .li-error{color:#ffb6bf}
        .li-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
        .li-stats div{display:grid;gap:4px;padding:16px;border:1px solid var(--ws-border);border-radius:14px;background:var(--ws-panel)}
        .li-stats strong{font-size:26px}.li-stats span{color:var(--ws-muted);font-size:12px}
        .li-list{display:grid;gap:8px}
        .li-list article{display:flex;align-items:center;gap:14px;padding:14px 16px;border:1px solid var(--ws-border);border-radius:14px;background:var(--ws-panel);flex-wrap:wrap}
        .li-main{flex:1;min-width:200px;display:grid;gap:4px}.li-main small{color:var(--ws-muted);font-size:11px}.li-main p{margin:4px 0 0;color:var(--ws-muted);font-size:12px;line-height:1.5}
        .li-score{font-size:20px}.li-list i{font-style:normal;color:var(--ws-muted);font-size:11px}.li-list a{color:var(--ws-accent);font-size:12px}
        @media(max-width:700px){.li-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}
      `}</style>
    </main>
  );
}
