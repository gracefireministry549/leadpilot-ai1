import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runWorkPilot } from '../src/agents/workpilot';

type Handler = (url: URL) => Response | Promise<Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const originalFetch = globalThis.fetch;
let calls: string[] = [];

function stubFetch(handler: Handler) {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push(href);
    return handler(new URL(href));
  }) as typeof fetch;
}

/** Routes each public job feed to its own fixture; unlisted feeds return an empty, valid response. */
function feeds(fixtures: { remotive?: unknown; arbeitnow?: unknown; remoteok?: unknown }): Handler {
  return (url) => {
    if (url.hostname === 'remotive.com') return json(fixtures.remotive ?? { jobs: [] });
    if (url.hostname === 'www.arbeitnow.com') return json(fixtures.arbeitnow ?? { data: [] });
    if (url.hostname === 'remoteok.com') return json(fixtures.remoteok ?? []);
    return json({}, 404);
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('WorkPilot', () => {
  it('ranks, sanitizes and de-duplicates listings from several boards', async () => {
    stubFetch(feeds({
      remotive: {
        jobs: [
          { title: 'React Developer', company_name: 'Acme', url: 'https://remotive.com/remote-jobs/software-dev/react-developer-1', description: '<p>Build &amp; ship React apps. Remote friendly.</p>', candidate_required_location: 'Worldwide', salary: '$60k', publication_date: '2026-11-10T08:00:00', category: 'Software Development', tags: ['react', 'typescript'] },
          { title: 'React Developer', company_name: 'Acme', url: 'https://remotive.com/remote-jobs/software-dev/react-developer-1?utm_source=newsletter', description: 'Same listing with a tracking parameter.', candidate_required_location: 'Worldwide' },
          { title: 'Click me', company_name: 'Evil', url: 'javascript:alert(1)', description: 'Unsafe link.' },
          { title: 'Senior Software Engineer', company_name: 'Buildco', url: 'https://remotive.com/remote-jobs/software-dev/swe-2', description: 'We build and ship systems with strong requirements.', candidate_required_location: 'USA' },
        ],
      },
      arbeitnow: {
        data: [
          { title: 'React Developer', company_name: 'Acme', url: 'https://www.arbeitnow.com/jobs/acme-react-dev', description: '', location: 'Berlin', remote: true, created_at: 1762761600, tags: ['react'] },
          { title: 'JavaScript Engineer', company_name: 'Other', url: 'https://www.arbeitnow.com/jobs/other-js', description: '', location: 'Berlin', created_at: 1762761600, tags: ['javascript'] },
        ],
      },
      remoteok: [
        { legal: 'Please link back to remoteok.com when you use this data.' },
        { position: 'React Native Dev', company: 'Beta', id: '3', url: 'https://remoteok.com/remote-jobs/rn-3', tags: ['react'], date: '2026-11-09T00:00:00+00:00', salary_min: 50000, salary_max: 80000, description: '<b>Mobile</b>' },
      ],
    }));

    const result = await runWorkPilot({ agent: 'workpilot', query: 'react developer', limit: 10 });

    assert.deepEqual(result.results.map((job) => job.title), ['React Developer', 'React Native Dev', 'Senior Software Engineer']);
    assert.ok(result.results.every((job) => /^https?:\/\//.test(job.url)), 'only http(s) links are returned');
    assert.equal(new Set(result.results.map((job) => job.id)).size, result.results.length, 'ids are unique');
    assert.deepEqual(result.results.map((job) => job.matchScore), [...result.results.map((job) => job.matchScore)].sort((a, b) => b - a));
    assert.equal(result.results[0].description.includes('&amp;'), false, 'HTML entities are decoded');
    assert.match(result.results[0].description, /Build & ship React apps/);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /^1 listing skipped/);
  });

  it('gives different URLs on the same host different ids', async () => {
    stubFetch(feeds({
      remotive: {
        jobs: [1, 2, 3].map((n) => ({ title: `Developer ${n}`, company_name: `Co ${n}`, url: `https://remotive.com/remote-jobs/software-dev/developer-${n}`, description: 'x' })),
      },
    }));

    const result = await runWorkPilot({ agent: 'workpilot', query: 'developer' });

    assert.equal(result.results.length, 3);
    assert.equal(new Set(result.results.map((job) => job.id)).size, 3);
  });

  it('normalizes dates, including unix timestamps', async () => {
    stubFetch(feeds({
      arbeitnow: { data: [{ title: 'Java Engineer', company_name: 'Acme', url: 'https://www.arbeitnow.com/jobs/java', description: '', created_at: 1762761600, tags: ['java'] }] },
    }));

    const [job] = (await runWorkPilot({ agent: 'workpilot', query: 'java' })).results;

    assert.equal(job.posted, new Date(1762761600 * 1000).toISOString());
  });

  it('matches whole words only', async () => {
    stubFetch(feeds({
      arbeitnow: {
        data: [
          { title: 'JavaScript Engineer', company_name: 'A', url: 'https://www.arbeitnow.com/jobs/a', description: '', tags: ['javascript'] },
          { title: 'Java Engineer', company_name: 'B', url: 'https://www.arbeitnow.com/jobs/b', description: '', tags: ['java'] },
        ],
      },
    }));

    const result = await runWorkPilot({ agent: 'workpilot', query: 'java' });

    assert.deepEqual(result.results.map((job) => job.title), ['Java Engineer']);
  });

  it('classifies by the title first and by whole words', async () => {
    stubFetch(feeds({
      remotive: {
        jobs: [
          { title: 'Senior Software Engineer', company_name: 'A', url: 'https://remotive.com/jobs/1', description: 'We build quiet, guided systems and own requirements.' },
          { title: 'Shopify Store Developer', company_name: 'B', url: 'https://remotive.com/jobs/2', description: 'Improve our storefront.' },
          { title: 'Fix broken checkout', company_name: 'C', url: 'https://remotive.com/jobs/3', description: 'Payments fail intermittently.' },
        ],
      },
    }));

    const result = await runWorkPilot({ agent: 'workpilot', query: 'developer' });
    const byTitle = Object.fromEntries(result.results.map((job) => [job.title, job]));

    assert.doesNotMatch(byTitle['Senior Software Engineer'].problem, /visual identity/, '"build" and "requirements" are not UI/UX');
    assert.match(byTitle['Shopify Store Developer'].problem, /web presence/);
    assert.match(byTitle['Fix broken checkout'].problem, /technical problem/);
  });

  it('writes a grammatical proposal addressed to the client', async () => {
    stubFetch(feeds({
      remotive: { jobs: [{ title: 'Shopify Store Developer', company_name: 'Acme', url: 'https://remotive.com/jobs/2', description: 'Improve our storefront.' }] },
    }));

    const [job] = (await runWorkPilot({ agent: 'workpilot', query: 'shopify' })).results;

    assert.match(job.proposal, /^Hi Acme team, I reviewed your listing "Shopify Store Developer"\./);
    assert.match(job.proposal, /I understand you need a stronger or functioning web presence\./);
    assert.doesNotMatch(job.proposal, /you need the client/i);
  });

  it('reports a failing source and still returns the others', async () => {
    stubFetch((url) => {
      if (url.hostname === 'remotive.com') return json({}, 503);
      if (url.hostname === 'remoteok.com') throw new Error('network down');
      return json({ data: [{ title: 'Java Engineer', company_name: 'B', url: 'https://www.arbeitnow.com/jobs/b', description: '', tags: ['java'] }] });
    });

    const result = await runWorkPilot({ agent: 'workpilot', query: 'java' });

    assert.equal(result.results.length, 1);
    assert.ok(result.warnings.includes('Remotive: live discovery was unavailable (HTTP 503).'));
    assert.ok(result.warnings.includes('RemoteOK: live discovery was unavailable (network down).'));
  });

  it('never invents listings when every source fails', async () => {
    stubFetch(() => json({}, 500));

    const result = await runWorkPilot({ agent: 'workpilot', query: 'react developer' });

    assert.deepEqual(result.results, []);
    assert.equal(result.links.length, 4);
    assert.ok(result.links.every((link) => link.url.includes('react')));
    assert.match(result.warnings.at(-1) ?? '', /did not invent jobs/);
  });

  it('does not call any job board for a blank query', async () => {
    stubFetch(feeds({}));

    const result = await runWorkPilot({ agent: 'workpilot', query: '   ' });

    assert.equal(calls.length, 0);
    assert.deepEqual(result.results, []);
    assert.equal(result.warnings.length, 1);
  });
});
