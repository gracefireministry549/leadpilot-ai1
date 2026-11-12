'use client';

import { useState, type FormEvent } from 'react';

type Job = {
  id: string; title: string; source: string; url: string; description: string; matchScore: number; label: 'GOOD' | 'MEDIUM' | 'BAD';
  skills: string[]; problem: string; solution: string; plan: string[]; proposal: string;
};
type Result = { results?: Job[]; warnings?: string[]; strategy?: string[] };

export default function WorkPilotPage() {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<Result | null>(null);

  async function search(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setData(null);
    try {
      const response = await fetch('/api/workpilot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, location: location || undefined, limit: 20 }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'WorkPilot could not complete this search.');
      setData(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'WorkPilot could not complete this search.');
    } finally {
      setLoading(false);
    }
  }

  const jobs = data?.results ?? [];

  return (
    <main className="wp">
      <header>
        <p className="wp-eyebrow">WORKPILOT</p>
        <h1>Find work you can win</h1>
        <p className="wp-muted">Searches public job listings, ranks them against your query and drafts a problem statement, plan and proposal for each. It never invents listings and never applies for you.</p>
      </header>

      <form onSubmit={search}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. website design, bookkeeping, video editing" required minLength={2} maxLength={120} />
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" maxLength={80} />
        <button disabled={loading}>{loading ? 'Searching…' : 'Find work'}</button>
      </form>

      {error ? <p role="alert" className="wp-error">{error}</p> : null}
      {data?.warnings?.map((warning) => <p key={warning} className="wp-warning">{warning}</p>)}

      <div className="wp-list">
        {jobs.map((job) => (
          <article key={job.id}>
            <div className="wp-head">
              <div><small>{job.source}</small><h2>{job.title}</h2></div>
              <span className={'wp-label is-' + job.label.toLowerCase()}>{job.label} · {job.matchScore}</span>
            </div>
            {job.skills.length ? <p className="wp-skills">{job.skills.join(' · ')}</p> : null}
            <details>
              <summary>Problem, plan and draft proposal</summary>
              <h3>Problem</h3><p>{job.problem}</p>
              <h3>Solution</h3><p>{job.solution}</p>
              <h3>Plan</h3><ol>{job.plan.map((step) => <li key={step}>{step}</li>)}</ol>
              <h3>Draft proposal</h3><pre>{job.proposal}</pre>
            </details>
            <a href={job.url} target="_blank" rel="noreferrer">Open listing ↗</a>
          </article>
        ))}
      </div>

      <style>{`
        .wp{display:grid;gap:16px;color:var(--ws-text)}
        .wp-eyebrow{margin:0;color:var(--ws-accent);font-size:10px;letter-spacing:.16em;font-weight:800}
        .wp h1{margin:6px 0;font-size:34px}.wp-muted{margin:0;color:var(--ws-muted);font-size:13px;line-height:1.6;max-width:680px}
        .wp form{display:grid;grid-template-columns:2fr 1fr auto;gap:8px}
        .wp input{min-width:0;padding:13px;border:1px solid var(--ws-border);border-radius:10px;background:var(--ws-panel);color:var(--ws-text)}
        .wp button{padding:13px 18px;border:0;border-radius:10px;background:var(--ws-accent-strong);color:#fff;font-weight:700;cursor:pointer}.wp button:disabled{opacity:.5}
        .wp-error{color:#ffb6bf}.wp-warning{margin:0;padding:10px 12px;border:1px solid #5c4a1c;border-radius:10px;background:#2a2210;color:#f5d58b;font-size:12px}
        .wp-list{display:grid;gap:10px}
        .wp-list article{display:grid;gap:10px;padding:16px;border:1px solid var(--ws-border);border-radius:14px;background:var(--ws-panel)}
        .wp-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.wp-head small{color:var(--ws-accent);font-size:10px;letter-spacing:.1em}.wp-head h2{margin:4px 0 0;font-size:16px}
        .wp-label{padding:4px 10px;border-radius:8px;font-size:11px;font-weight:700;white-space:nowrap}
        .wp-label.is-good{background:#12683f;color:#b9f5d6}.wp-label.is-medium{background:#6b4d0c;color:#ffe0a0}.wp-label.is-bad{background:#2a3160;color:#b9c2f0}
        .wp-skills{margin:0;color:var(--ws-muted);font-size:12px}
        .wp details{color:var(--ws-muted);font-size:13px;line-height:1.6}.wp summary{color:var(--ws-accent);cursor:pointer;font-size:12px}
        .wp h3{margin:12px 0 4px;color:var(--ws-text);font-size:13px}.wp pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:12px;border-radius:10px;background:var(--ws-bg);font-size:12px}
        .wp-list a{color:var(--ws-accent);font-size:12px}
        @media(max-width:700px){.wp form{grid-template-columns:1fr}}
      `}</style>
    </main>
  );
}
