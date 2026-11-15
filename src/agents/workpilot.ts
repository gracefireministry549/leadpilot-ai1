import type { AgentRunInput } from './runtime';

export type WorkPilotJob = {
  id: string; title: string; company?: string; description: string; url: string;
  source: string; location?: string; compensation?: string; posted?: string;
  matchScore: number; label: 'GOOD' | 'MEDIUM' | 'BAD'; skills: string[];
  problem: string; solution: string; plan: string[]; proposal: string;
};

export interface WorkPilotResult {
  agent: 'workpilot';
  generatedAt: string;
  results: WorkPilotJob[];
  links: { name: string; url: string }[];
  warnings: string[];
  strategy: string[];
}

/** A listing as returned by a source, before validation and scoring. */
type RawJob = {
  title: string; description: string; url: string; source: string;
  company?: string; location?: string; compensation?: string; posted?: string;
  /** Categories/tags used for relevance matching only; never returned to the client. */
  tags?: string;
};

type Source = { name: string; fetch: (query: string, limit: number) => Promise<RawJob[]> };

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const FETCH_TIMEOUT_MS = 12_000;
const USER_AGENT = 'LeadPilot WorkPilot/1.0';
const STOP_WORDS = new Set(['and', 'the', 'for', 'with', 'job', 'jobs', 'need', 'looking', 'find']);

const STRATEGY = [
  'Queries real job-board APIs (Remotive, Arbeitnow, RemoteOK) that return actual listings with canonical URLs.',
  'Deduplicates by URL (ignoring tracking parameters) and by company + title across boards, and ranks by whole-word query relevance (title matches count more), remote-friendliness and compensation signals.',
  'For every discovered opportunity, produces a problem statement, solution, work plan and draft proposal.',
  'When no source returns data, results stay empty and official marketplace search links are provided — no fabricated listings.',
];

// ---------------------------------------------------------------------------
// Small, dependency-free helpers (safe for Node and Cloudflare Workers)
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function clampLimit(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Plain text only: scripts/styles and tags removed, entities decoded, whitespace collapsed. */
function stripHtml(s: string): string {
  const withoutTags = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ');
  return decodeEntities(withoutTags).replace(/\s+/g, ' ').trim();
}

function toIsoDate(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  let ms: number;
  if (typeof value === 'number') ms = value < 1e12 ? value * 1000 : value;
  else if (typeof value === 'string' && /^\d{9,13}$/.test(value.trim())) {
    const n = Number(value);
    ms = n < 1e12 ? n * 1000 : n;
  } else ms = Date.parse(String(value));
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** Listing data is untrusted: only plain http(s) links are ever returned to the UI. */
function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|source$|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}${url.search}`.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Stable 53-bit string hash (cyrb53). Synchronous and runtime-agnostic, so ids need no Buffer or crypto. */
function hash53(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function makeId(source: string, url: string) {
  return `${source.toLowerCase()}-${hash53(url)}`;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

// ---------------------------------------------------------------------------
// Query matching and scoring
// ---------------------------------------------------------------------------

function queryTokens(query: string): string[] {
  const all = [...new Set(
    query.toLowerCase().split(/[^a-z0-9+#.]+/).map((t) => t.replace(/^\.+|\.+$/g, '')).filter((t) => t.length >= 2),
  )];
  const meaningful = all.filter((t) => !STOP_WORDS.has(t));
  return meaningful.length ? meaningful : all;
}

/** Whole-word (optionally plural) matchers, so "java" does not match "javascript". */
function tokenMatchers(tokens: string[]): RegExp[] {
  return tokens.map((t) => new RegExp(`(?<![a-z0-9])${escapeRegExp(t)}(?:s|es)?(?![a-z0-9])`, 'i'));
}

function scoreMatch(matchers: RegExp[], title: string, body: string, compensation?: string): number {
  const total = matchers.length || 1;
  const titleHits = matchers.filter((re) => re.test(title)).length;
  const anyHits = matchers.filter((re) => re.test(title) || re.test(body)).length;
  const text = `${title} ${body}`;
  const remote = /\b(remote|worldwide|anywhere|flexible)\b/i.test(text) ? 5 : 0;
  const pay = compensation || /(?:[$€£])\s?\d|\b(budget|salary|hourly|fixed[- ]price)\b/i.test(text) ? 5 : 0;
  return clamp(Math.round(25 + 40 * (anyHits / total) + 20 * (titleHits / total) + remote + pay), 25, 98);
}

function label(score: number): WorkPilotJob['label'] {
  return score >= 75 ? 'GOOD' : score >= 55 ? 'MEDIUM' : 'BAD';
}

const SKILL_PATTERN = /\b(?:react|next\.js|typescript|javascript|python|node\.js|wordpress|shopify|figma|seo|marketing|sales|design|php|java|flutter|aws|sql|ai|automation|copywriting|vue|angular|django|laravel|tailwind|docker|graphql|supabase)\b/gi;

function extractSkills(text: string): string[] {
  return [...new Set((text.match(SKILL_PATTERN) ?? []).map((s) => s.toLowerCase()))].slice(0, 8);
}

// ---------------------------------------------------------------------------
// Problem -> solution -> proposal
// ---------------------------------------------------------------------------

type Category = { pattern: RegExp; need: string; problem: string; solution: string };

/** Checked in order; the first category whose pattern matches wins. */
const CATEGORIES: Category[] = [
  {
    pattern: /\b(?:web|websites?|shopify|wordpress|woocommerce|webflow|landing)\b/i,
    need: 'a stronger or functioning web presence',
    problem: 'The client needs a stronger or functioning web presence.',
    solution: 'Audit the current experience, define the required pages, implement the highest-impact changes, test mobile/performance, and deliver the site.',
  },
  {
    pattern: /\b(?:logo|brand(?:ing)?|design(?:er|ing)?|ui|ux)\b/i,
    need: 'a clearer visual identity or user experience',
    problem: 'The client needs a clearer visual identity or user experience.',
    solution: 'Create a small brand system, produce initial concepts, validate the chosen direction, and deliver reusable assets.',
  },
  {
    pattern: /\b(?:bugs?|errors?|fix(?:es|ing)?|broken|issues?)\b/i,
    need: 'a technical problem diagnosed and fixed with verification',
    problem: 'The client has a technical problem that needs diagnosis and a verified fix.',
    solution: 'Reproduce the issue, isolate the root cause, implement the smallest safe fix, add a regression check, and verify the result.',
  },
  {
    pattern: /\b(?:marketing|seo|sales|leads?)\b/i,
    need: 'more qualified attention, traffic or customers',
    problem: 'The client needs more qualified attention, traffic or customers.',
    solution: 'Define the target audience, audit the current funnel, create measurable improvements, and report the resulting signals.',
  },
];

const FALLBACK_CATEGORY: Category = {
  pattern: /$^/,
  need: 'a defined deliverable and a clear execution plan',
  problem: 'The client has a business task that needs a defined deliverable and execution plan.',
  solution: 'Clarify requirements, split the work into milestones, build the smallest complete solution, test it, and hand over documentation.',
};

const PLAN = [
  'Clarify requirements and acceptance criteria',
  'Audit the existing work and constraints',
  'Build the first working version',
  'Test against the client requirements',
  'Deliver, document and request approval',
];

/** The listing title is the strongest signal of intent; fall back to the description only when it says nothing. */
function categorize(title: string, description: string): Category {
  return (
    CATEGORIES.find((c) => c.pattern.test(title)) ??
    CATEGORIES.find((c) => c.pattern.test(description.slice(0, 800))) ??
    FALLBACK_CATEGORY
  );
}

function draftProposal(title: string, company: string | undefined, category: Category): string {
  return [
    `Hi${company ? ` ${company} team` : ''}, I reviewed your listing "${title}".`,
    `I understand you need ${category.need}.`,
    `My approach: ${category.solution}`,
    'I would start with a quick requirements/audit pass, then deliver the work in clear milestones with testing before handoff.',
    'I can share the first milestone plan before implementation.',
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

const SOURCES: Source[] = [
  {
    name: 'Remotive',
    async fetch(query, limit) {
      const count = clamp(limit * 2, 25, MAX_LIMIT);
      const data = asRecord(await fetchJson(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=${count}`));
      return (Array.isArray(data.jobs) ? data.jobs : []).map((item): RawJob => {
        const job = asRecord(item);
        return {
          source: 'Remotive',
          title: asString(job.title),
          company: asString(job.company_name) || undefined,
          description: stripHtml(asString(job.description)).slice(0, 2000),
          url: asString(job.url),
          location: asString(job.candidate_required_location) || undefined,
          compensation: asString(job.salary) || undefined,
          posted: toIsoDate(job.publication_date),
          tags: [job.category, ...(Array.isArray(job.tags) ? job.tags : [])].map(asString).join(' '),
        };
      }).filter((job) => job.title && job.url).slice(0, limit);
    },
  },
  {
    name: 'Arbeitnow',
    async fetch(query, limit) {
      const data = asRecord(await fetchJson('https://www.arbeitnow.com/api/job-board-api'));
      const matchers = tokenMatchers(queryTokens(query));
      return (Array.isArray(data.data) ? data.data : [])
        .map((item): RawJob => {
          const job = asRecord(item);
          return {
            source: 'Arbeitnow',
            title: asString(job.title),
            company: asString(job.company_name) || undefined,
            description: stripHtml(asString(job.description)).slice(0, 2000),
            url: asString(job.url),
            location: asString(job.location) || (job.remote === true ? 'Remote' : undefined),
            posted: toIsoDate(job.created_at),
            tags: Array.isArray(job.tags) ? job.tags.map(asString).join(' ') : '',
          };
        })
        .filter((job) => job.title && job.url)
        .filter((job) => matchers.length === 0 || matchers.some((re) => re.test(`${job.title} ${job.company ?? ''} ${job.tags ?? ''}`)))
        .slice(0, limit);
    },
  },
  {
    name: 'RemoteOK',
    async fetch(query, limit) {
      const data = await fetchJson('https://remoteok.com/api');
      const matchers = tokenMatchers(queryTokens(query));
      return (Array.isArray(data) ? data : [])
        .map(asRecord)
        .filter((job) => asString(job.position).trim() !== '') // the first array element is a legal notice, not a job
        .map((job): RawJob => {
          const min = typeof job.salary_min === 'number' && job.salary_min > 0 ? job.salary_min : null;
          const max = typeof job.salary_max === 'number' && job.salary_max > 0 ? job.salary_max : null;
          const range = min || max
            ? [min ? `$${Math.round(min / 1000)}k` : null, max ? `$${Math.round(max / 1000)}k` : null].filter(Boolean).join('–')
            : undefined;
          return {
            source: 'RemoteOK',
            title: asString(job.position),
            company: asString(job.company) || undefined,
            description: stripHtml(asString(job.description)).slice(0, 2000),
            url: asString(job.url) || (asString(job.id) ? `https://remoteok.com/remote-jobs/${asString(job.id)}` : ''),
            location: asString(job.location) || undefined,
            compensation: range,
            posted: toIsoDate(job.date ?? job.epoch),
            tags: Array.isArray(job.tags) ? job.tags.map(asString).join(' ') : '',
          };
        })
        .filter((job) => job.title && job.url)
        .filter((job) => matchers.length === 0 || matchers.some((re) => re.test(`${job.title} ${job.company ?? ''} ${job.tags ?? ''}`)))
        .slice(0, limit);
    },
  },
];

function officialSearchLinks(query: string) {
  const q = encodeURIComponent(query);
  return [
    { name: 'Indeed', url: `https://www.indeed.com/jobs?q=${q}` },
    { name: 'Upwork', url: `https://www.upwork.com/nx/search/jobs/?q=${q}` },
    { name: 'Freelancer', url: `https://www.freelancer.com/jobs/${q}/` },
    { name: 'Fiverr', url: `https://www.fiverr.com/search/gigs?query=${q}` },
  ];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runWorkPilot(input: AgentRunInput): Promise<WorkPilotResult> {
  const query = (input.query ?? '').trim();
  const limit = clampLimit(input.limit);
  const generatedAt = new Date().toISOString();

  if (!query) {
    return {
      agent: 'workpilot', generatedAt, results: [], links: [], strategy: STRATEGY,
      warnings: ['Enter the kind of work you want, for example "react developer", so WorkPilot can search the job boards.'],
    };
  }

  const warnings: string[] = [];
  const settled = await Promise.allSettled(SOURCES.map((source) => source.fetch(query, limit)));
  const raw: RawJob[] = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') raw.push(...outcome.value);
    else {
      const reason = outcome.reason instanceof Error ? outcome.reason.message : 'request failed';
      warnings.push(`${SOURCES[index].name}: live discovery was unavailable (${reason}).`);
    }
  });

  const matchers = tokenMatchers(queryTokens(query));
  let skipped = 0;
  const scored: WorkPilotJob[] = [];
  for (const item of raw) {
    const title = item.title.trim();
    const url = safeHttpUrl(item.url);
    if (!title || !url) { skipped++; continue; }
    const body = `${item.description} ${item.location ?? ''} ${item.tags ?? ''}`;
    const category = categorize(title, item.description);
    const matchScore = scoreMatch(matchers, title, body, item.compensation);
    scored.push({
      id: makeId(item.source, url),
      title,
      company: item.company,
      description: item.description,
      url,
      source: item.source,
      location: item.location,
      compensation: item.compensation,
      posted: item.posted,
      matchScore,
      label: label(matchScore),
      skills: extractSkills(`${title} ${item.description} ${item.tags ?? ''}`),
      problem: category.problem,
      solution: category.solution,
      plan: PLAN,
      proposal: draftProposal(title, item.company, category),
    });
  }
  if (skipped > 0) warnings.push(`${skipped} listing${skipped === 1 ? '' : 's'} skipped (missing a title or a valid http(s) link).`);

  scored.sort((a, b) => b.matchScore - a.matchScore || (b.posted ?? '').localeCompare(a.posted ?? '') || a.title.localeCompare(b.title));

  const results: WorkPilotJob[] = [];
  const seenUrls = new Set<string>();
  const seenListings = new Set<string>();
  for (const job of scored) {
    const urlKey = normalizeUrl(job.url);
    const listingKey = job.company ? `${slug(job.company)}|${slug(job.title)}` : '';
    if (seenUrls.has(urlKey) || (listingKey && seenListings.has(listingKey))) continue;
    seenUrls.add(urlKey);
    if (listingKey) seenListings.add(listingKey);
    results.push(job);
    if (results.length >= limit) break;
  }

  if (results.length === 0) {
    warnings.push('No live listings were returned by any job-board source. The agent did not invent jobs; use the official search links to continue manually.');
  }

  return { agent: 'workpilot', generatedAt, results, links: officialSearchLinks(query), warnings, strategy: STRATEGY };
}
