import { NewsTrendProvider } from '../providers/news-trend-provider';
import { RedditTrendProvider } from '../providers/reddit-trend-provider';
import { DuckDuckGoLeadProvider, SearXNGLeadProvider, TavilyLeadProvider } from '../providers/web-search-provider';
import type { DiscoveredBusiness, LeadProvider, LeadSearchQuery } from '../providers/lead-provider';
import { buildReliableLeadReport } from '../leads/reliable-report';
import { scoreLead } from '../leads/scoring';
import { verifyBusiness } from '../leads/verification';
import { researchLead } from './lead-research-agent';
import type { FinderPipelineResult } from '../pipeline/lead-finder-pipeline';
import type { AgentName } from '../../docs/agent-contract';
import type { BusinessRecord, LeadRecord } from '../leads/model';

export type EvidenceAgentName = Extract<AgentName, 'trend-finder' | 'opportunity-finder' | 'tender-finder' | 'ecommerce-opportunity'>;

export interface EvidenceAgentResult {
  agent: AgentName;
  results: FinderPipelineResult[];
  warnings: string[];
  strategy: string[];
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
/** Backstop so one hung source can never stall the whole agent (providers also set their own, shorter timeouts). */
const PROVIDER_TIMEOUT_MS = 15_000;
/** Enrichment fetches a page per record; Cloudflare Workers allow only ~6 simultaneous outgoing connections anyway. */
const ENRICH_CONCURRENCY = 5;

const KEYWORDS: Record<EvidenceAgentName, (query: string) => string> = {
  // Google News RSS is a legitimate trend signal: rising markets, product launches
  // and demand shifts are covered by the press before they reach directories.
  'trend-finder': (q) => `${q} emerging trend market demand growth industry news`,
  'opportunity-finder': (q) => `${q} business opportunity market gap customer demand pain point companies`,
  // Tenders, RFPs and contract awards are published and reported as news, so news
  // RSS is the correct primary source (directories like OSM hold no tender data).
  'tender-finder': (q) => `(${q}) (tender OR "request for proposal" OR RFP OR procurement OR "contract award" OR bid)`,
  'ecommerce-opportunity': (q) => `${q} product demand "buying intent" ecommerce market opportunity trending products`,
};

interface NamedProvider {
  /** Stable label for warnings. Class names are mangled by production bundlers, so never rely on constructor.name. */
  name: string;
  provider: LeadProvider;
}

/**
 * Evidence agents research signals (trends, opportunities, tenders), not local
 * businesses. Local-directory providers (Photon/OpenStreetMap) are therefore
 * deliberately excluded here; they belong to lead-finder only. Every source used
 * below returns a public URL the user can inspect — no synthetic records.
 */
function evidenceProviders(agent: EvidenceAgentName): NamedProvider[] {
  const providers: NamedProvider[] = [{ name: 'Google News', provider: new NewsTrendProvider() }];
  // Reddit is useful for trend/opportunity/ecommerce signals, but it is
  // deliberately omitted for tenders and is never allowed to block a search.
  if (agent !== 'tender-finder') providers.push({ name: 'Reddit', provider: new RedditTrendProvider() });
  // Optional web-search providers, enabled explicitly via LEAD_WEB_DISCOVERY.
  if (process.env.LEAD_WEB_DISCOVERY === 'true') {
    const searxngUrl = process.env.SEARXNG_URL?.trim();
    const tavilyKey = process.env.TAVILY_API_KEY?.trim();
    if (searxngUrl) providers.push({ name: 'SearXNG', provider: new SearXNGLeadProvider(searxngUrl) });
    if (tavilyKey) providers.push({ name: 'Tavily', provider: new TavilyLeadProvider(tavilyKey) });
    providers.push({ name: 'DuckDuckGo', provider: new DuckDuckGoLeadProvider() });
  }
  return providers;
}

function clampLimit(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Round-robin across sources so one chatty source cannot crowd the others out of the limit. */
function interleave<T>(lists: T[][]): T[] {
  const merged: T[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) if (i < list.length) merged.push(list[i]);
  }
  return merged;
}

/** Identity of a record: its URL without tracking noise, or its name when it has no URL. */
function recordKey(record: DiscoveredBusiness): string {
  const website = (record.website ?? '').trim();
  if (website) {
    try {
      const url = new URL(website);
      for (const key of [...url.searchParams.keys()]) {
        if (/^(utm_|fbclid$|gclid$|oc$|ref$)/i.test(key)) url.searchParams.delete(key);
      }
      return `url:${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}${url.search}`.toLowerCase();
    } catch {
      return `url:${website.toLowerCase()}`;
    }
  }
  const name = (record.name ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  return name ? `name:${name}` : '';
}

function dedupeRecords(records: DiscoveredBusiness[]): DiscoveredBusiness[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = recordKey(record);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const output = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await task(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return output;
}

async function buildResult(discovered: DiscoveredBusiness, industry: string | undefined): Promise<FinderPipelineResult> {
  const business: BusinessRecord = {
    id: crypto.randomUUID(),
    name: discovered.name,
    website: discovered.website,
    phone: discovered.phone,
    email: discovered.email,
    address: discovered.address,
    city: discovered.city,
    country: discovered.country,
    industry: discovered.industry,
    source: discovered.source,
  };
  const baseScore = scoreLead(business, verifyBusiness(business), industry);
  // Independent network work: run it side by side.
  const [researched, report] = await Promise.all([researchLead(business, baseScore), buildReliableLeadReport(business)]);
  const now = new Date().toISOString();
  const lead: LeadRecord = {
    id: crypto.randomUUID(),
    accountId: 'agent-research',
    businessId: business.id,
    status: 'NEW',
    score: researched.score.score,
    scoreLabel: researched.score.label,
    createdAt: now,
    updatedAt: now,
  };
  return { business, lead, report, research: researched.research };
}

/** Evidence-first agents; provider failures are warnings, not fatal agent errors. */
export async function runEvidenceAgent(
  agent: EvidenceAgentName,
  query: string,
  fields: Pick<LeadSearchQuery, 'country' | 'city' | 'industry' | 'keywords' | 'limit'> = {},
): Promise<EvidenceAgentResult> {
  const limit = clampLimit(fields.limit);
  const keywords = KEYWORDS[agent](query);
  const request: LeadSearchQuery = { keywords, industry: fields.industry, city: fields.city, country: fields.country, limit };
  const providers = evidenceProviders(agent);

  const settled = await Promise.allSettled(providers.map(({ provider }) => withTimeout(provider.search(request), PROVIDER_TIMEOUT_MS)));
  const warnings: string[] = [];
  const perProvider: DiscoveredBusiness[][] = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      perProvider.push(outcome.value);
    } else {
      // Reddit in particular can return 403 for datacenter requests; report and continue.
      warnings.push(`${providers[index].name}: ${outcome.reason instanceof Error ? outcome.reason.message : 'search failed'}`);
    }
  });

  const unique = dedupeRecords(interleave(perProvider)).slice(0, limit);
  if (!unique.length) {
    warnings.push('No source-backed evidence matched this request. The agent did not invent trends, opportunities or tenders; try broader keywords or a different market.');
  }

  // One record failing to enrich must not discard everything else the agent found.
  let failed = 0;
  const enriched = await mapWithConcurrency(unique, ENRICH_CONCURRENCY, async (discovered) => {
    try {
      return await buildResult(discovered, fields.industry);
    } catch {
      failed++;
      return null;
    }
  });
  if (failed > 0) {
    warnings.push(`${failed} of ${unique.length} evidence records could not be processed and were left out.`);
  }
  const results = enriched.filter((item): item is FinderPipelineResult => item !== null);
  results.sort((a, b) => b.lead.score - a.lead.score);

  return {
    agent,
    results,
    warnings,
    strategy: [
      'Matched the agent to source-appropriate evidence: news for trends and tenders, news plus Reddit for market/e-commerce signals.',
      'Local business directories are excluded from evidence agents; they are used by lead-finder only.',
      'Queried all configured sources in parallel with per-source timeouts, isolated provider failures as warnings, and interleaved sources so none crowds out the rest.',
      'Every returned record carries a public source URL the user can inspect; no synthetic trends, opportunities or tenders were created.',
    ],
  };
}
