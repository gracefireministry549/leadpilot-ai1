import test from 'node:test';
import assert from 'node:assert/strict';
import { configuredLlmProviders, llmComplete, parseJsonObject } from '../src/llm/router.ts';
import { cacheGet, cacheSet, rateLimit, cacheBackend } from '../src/cache/redis.ts';
import { buildEvidence, deterministicBrief, filterRealResults, groundBrief, groundText, isRealUrl } from '../src/agents/grounding.ts';
import { formatMemoryForPrompt, rememberMemory } from '../src/memory/agent-memory.ts';

const ok = (body) => ({ ok: true, status: 200, json: async () => body });
const fail = (status) => ({ ok: false, status, json: async () => ({}) });

test('providers are ordered, filtered by configured keys and models are overridable', () => {
  const env = { GEMINI_API_KEY: 'g', OPENROUTER_API_KEY: 'o', GROQ_API_KEY: 'q', GEMINI_MODEL: 'custom' };
  assert.deepEqual(configuredLlmProviders(env).map((p) => p.id), ['groq', 'gemini', 'openrouter']);
  assert.equal(configuredLlmProviders(env)[1].model, 'custom');
  assert.deepEqual(configuredLlmProviders({ ...env, LLM_PROVIDER_ORDER: 'openrouter,gemini' }).map((p) => p.id), ['openrouter', 'gemini', 'groq']);
});

test('llmComplete reports missing keys instead of throwing', async () => {
  const result = await llmComplete({ messages: [{ role: 'user', content: 'hi' }] }, {});
  assert.equal(result.ok, false);
});

test('llmComplete falls back to the next provider when one fails', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('groq')) return fail(429);
    return ok({ candidates: [{ content: { parts: [{ text: '{"summary":"x"}' }] } }] });
  };
  const result = await llmComplete({ messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'u' }], json: true }, { GROQ_API_KEY: 'a', GEMINI_API_KEY: 'b' }, fetchImpl);
  assert.equal(result.ok, true);
  assert.equal(result.provider, 'gemini');
  assert.equal(calls.length, 2);
});

test('llmComplete returns every provider error when all fail', async () => {
  const result = await llmComplete({ messages: [{ role: 'user', content: 'u' }] }, { GROQ_API_KEY: 'a', XAI_API_KEY: 'b' }, async () => fail(500));
  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
});

test('parseJsonObject tolerates code fences and surrounding prose', () => {
  assert.deepEqual(parseJsonObject('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonObject('Here you go: {"a":2} thanks'), { a: 2 });
  assert.equal(parseJsonObject('no json'), null);
});

test('in-memory cache stores and expires values, and rate limiting counts per window', async () => {
  assert.equal(cacheBackend({}), 'memory');
  await cacheSet('k1', 'v', 60, {});
  assert.equal(await cacheGet('k1', {}), 'v');
  const first = await rateLimit('rl:test', 2, 60, {});
  const second = await rateLimit('rl:test', 2, 60, {});
  const third = await rateLimit('rl:test', 2, 60, {});
  assert.deepEqual([first.allowed, second.allowed, third.allowed], [true, true, false]);
});

test('redis backend is used when configured and a redis outage fails open', async () => {
  const env = { UPSTASH_REDIS_REST_URL: 'https://r.example.io', UPSTASH_REDIS_REST_TOKEN: 't' };
  assert.equal(cacheBackend(env), 'redis');
  const limited = await rateLimit('rl:x', 1, 60, env, async () => { throw new Error('down'); });
  assert.equal(limited.allowed, true);
  assert.equal(await cacheGet('k', env, async () => { throw new Error('down'); }), null);
});

test('isRealUrl rejects placeholders, private hosts and non-http schemes', () => {
  assert.equal(isRealUrl('https://www.bluebottle.com/menu'), true);
  for (const bad of ['https://example.com', 'http://localhost:3000', 'ftp://a.com', 'https://192.168.0.1', 'not a url', 'https://shop.test']) assert.equal(isRealUrl(bad), false, bad);
});

test('filterRealResults keeps checkable records and explains every drop', () => {
  const { kept, dropped } = filterRealResults([
    { name: 'Lagos Dental', source: 'openstreetmap', website: 'https://lagosdental.ng' },
    { name: 'Corner Cafe', source: 'photon', address: '12 Allen Ave' },
    { name: 'John Doe Plumbing', source: 'x', phone: '+2348012345678' },
    { name: 'No Anchor Ltd', source: 'web' },
    { name: 'Test Co', website: 'https://testco.io' },
    { website: 'https://nameless.io', source: 'web' },
  ]);
  assert.deepEqual(kept.map((r) => r.name), ['Lagos Dental', 'Corner Cafe']);
  assert.equal(dropped.length, 4);
  assert.ok(dropped.some((d) => d.reason === 'contains placeholder text'));
  assert.ok(dropped.some((d) => d.reason === 'no named source'));
});

test('groundText removes emails, phones and URLs that are not in the evidence', () => {
  const evidence = buildEvidence([{ name: 'Lagos Dental', source: 'osm', website: 'https://lagosdental.ng', phone: '+234 801 234 5678' }]);
  const { text, removed } = groundText('Call +234 801 234 5678 or visit https://lagosdental.ng, or email boss@fake.com and +1 415 555 2671, see https://made-up.io', evidence);
  assert.ok(text.includes('+234 801 234 5678') && text.includes('https://lagosdental.ng'));
  assert.equal(removed.length, 3);
  assert.ok(!text.includes('boss@fake.com'));
});

test('groundBrief discards picks that cite unknown evidence ids and cleans the text', () => {
  const evidence = buildEvidence([{ name: 'Lagos Dental', source: 'osm', website: 'https://lagosdental.ng' }]);
  const brief = groundBrief({ summary: 'One clinic, email ceo@ghost.com', picks: [{ evidence_id: 'E1', why: 'Has a site', next_step: 'Call' }, { evidence_id: 'E9', why: 'invented', next_step: 'x' }] }, evidence);
  assert.equal(brief.picks.length, 1);
  assert.equal(brief.picks[0].name, 'Lagos Dental');
  assert.ok(!brief.summary.includes('ceo@ghost.com'));
  assert.equal(groundBrief({ summary: '' }, evidence), null);
});

test('deterministicBrief states only what was retrieved and never invents on empty results', () => {
  assert.match(deterministicBrief('plumbers in Accra', []).summary, /Nothing was invented/);
  const evidence = buildEvidence([{ name: 'A', source: 's', address: '1 Main St' }]);
  assert.equal(deterministicBrief('q', evidence).picks.length, 1);
});

test('memory: findings without a source are rejected before any database call', async () => {
  let called = false;
  const supabase = { from() { called = true; return { insert: async () => ({ error: null }) }; } };
  const saved = await rememberMemory(supabase, { companyId: 'c', userId: 'u', employeeRole: 'r', sessionId: null, kind: 'finding', content: 'Some fact' });
  assert.equal(saved, false);
  assert.equal(called, false);
});

test('memory prompt text labels sources and handles empty memory', () => {
  assert.equal(formatMemoryForPrompt([]), 'REMEMBERED NOTES: none.');
  assert.match(formatMemoryForPrompt([{ id: '1', kind: 'finding', content: 'Acme is large', source_url: 'https://a.io', importance: 3, created_at: '' }]), /\[source: https:\/\/a\.io\]/);
});
