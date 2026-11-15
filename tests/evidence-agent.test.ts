import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runEvidenceAgent } from '../src/agents/evidence-agent';

const originalFetch = globalThis.fetch;

type Routes = { news?: () => Response; reddit?: () => Response };

function stubFetch(routes: Routes) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const host = new URL(href).hostname;
    if (host === 'news.google.com') return (routes.news ?? (() => rss([])))();
    if (host === 'www.reddit.com') return (routes.reddit ?? (() => redditJson([])))();
    // Page enrichment for the evidence URLs themselves: an empty, successful page.
    return new Response('<html><head><title>Evidence</title></head><body></body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  }) as typeof fetch;
}

const rss = (items: { title: string; link: string }[]) =>
  new Response(
    `<?xml version="1.0"?><rss><channel>${items.map((i) => `<item><title>${i.title}</title><link>${i.link}</link><source>Wire</source></item>`).join('')}</channel></rss>`,
    { status: 200, headers: { 'content-type': 'application/rss+xml' } },
  );

const redditJson = (titles: string[]) =>
  new Response(
    JSON.stringify({ data: { children: titles.map((title, i) => ({ data: { title, permalink: `/r/test/comments/${i}/post/`, subreddit_name_prefixed: 'r/test' } })) } }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('evidence agent', () => {
  it('interleaves sources so one source cannot crowd the others out of the limit', async () => {
    stubFetch({
      news: () => rss([1, 2, 3, 4, 5].map((n) => ({ title: `News ${n}`, link: `https://news.example/${n}` }))),
      reddit: () => redditJson(['Reddit 1', 'Reddit 2']),
    });

    const result = await runEvidenceAgent('trend-finder', 'solar', { limit: 4 });
    const sources = result.results.map((r) => r.business.source);

    assert.equal(result.results.length, 4);
    assert.equal(sources.filter((s) => s === 'reddit').length, 2);
    assert.equal(sources.filter((s) => s === 'google-news-rss').length, 2);
  });

  it('treats the same URL with and without tracking parameters as one record', async () => {
    stubFetch({
      news: () => rss([
        { title: 'Story', link: 'https://news.example/story?utm_source=feed' },
        { title: 'Story again', link: 'https://www.news.example/story/' },
        { title: 'Different story', link: 'https://news.example/other' },
      ]),
    });

    const result = await runEvidenceAgent('tender-finder', 'bridge');

    assert.deepEqual(result.results.map((r) => r.business.name).sort(), ['Different story', 'Story']);
  });

  it('labels a failing provider by name and still returns the rest', async () => {
    stubFetch({
      news: () => rss([{ title: 'Story', link: 'https://news.example/story' }]),
      reddit: () => new Response('blocked', { status: 403 }),
    });

    const result = await runEvidenceAgent('opportunity-finder', 'pet care');

    assert.equal(result.results.length, 1);
    assert.equal(result.warnings.length, 1);
    assert.match(result.warnings[0], /^Reddit: .*403/);
  });

  it('never invents evidence when every source fails', async () => {
    stubFetch({ news: () => new Response('down', { status: 500 }), reddit: () => new Response('down', { status: 500 }) });

    const result = await runEvidenceAgent('ecommerce-opportunity', 'yoga mats');

    assert.deepEqual(result.results, []);
    assert.ok(result.warnings.some((w) => w.startsWith('Google News:')));
    assert.ok(result.warnings.some((w) => w.startsWith('Reddit:')));
    assert.ok(result.warnings.some((w) => /did not invent/.test(w)));
  });

  it('falls back to the default limit for an invalid one', async () => {
    stubFetch({ news: () => rss(Array.from({ length: 30 }, (_, n) => ({ title: `Story ${n}`, link: `https://news.example/${n}` }))) });

    const result = await runEvidenceAgent('trend-finder', 'solar', { limit: Number.NaN });

    assert.ok(result.results.length > 0 && result.results.length <= 20);
  });

  it('sorts results by score, highest first', async () => {
    stubFetch({ news: () => rss([1, 2, 3].map((n) => ({ title: `Story ${n}`, link: `https://news.example/${n}` }))) });

    const scores = (await runEvidenceAgent('trend-finder', 'solar')).results.map((r) => r.lead.score);

    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  });
});
