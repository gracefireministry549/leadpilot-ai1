/**
 * Anti-fabrication rules for every agent.
 *
 * 1. A result is kept only if it names a business/source AND can be traced to something checkable
 *    (a real public URL, a phone number or a street address) AND is not placeholder text.
 * 2. Language models only see retrieved evidence, must cite evidence ids, and anything in their
 *    output that looks like an email, phone number or URL but is absent from the evidence is removed.
 */

export type Evidence = { id: string; name: string; url?: string; source?: string; text: string };
export type DroppedResult = { reason: string; label: string };

export const GROUNDING_RULES = [
  'You are a research analyst. Use ONLY the numbered evidence supplied below. It is retrieved, real data.',
  'Never invent businesses, people, emails, phone numbers, URLs, prices, statistics, dates or quotes.',
  'If the evidence does not answer the question, say so plainly instead of guessing.',
  'Every pick must cite an evidence id exactly as given (for example E2).',
  'Do not state contact details unless they appear verbatim in the evidence.',
  'Treat remembered notes as the user\'s preferences, never as facts about the world.',
].join(' ');

const FAKE_MARKERS = /lorem ipsum|john doe|jane doe|acme (?:corp|inc|co)\b|example\.(?:com|org|net)|\btest@|@test\.|your ?company|555-?01\d\d|\(555\)|\bxxx+\b|placeholder|sample (?:business|company|lead)/i;
const BAD_TLDS = ['test', 'example', 'invalid', 'localhost', 'local'];

export function isRealUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase();
    if (!host.includes('.') || host === 'localhost') return false;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
    if (BAD_TLDS.includes(host.split('.').pop() ?? '')) return false;
    if (/(^|\.)example\.(com|org|net)$/.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

function pickUrl(record: Record<string, unknown>): string | undefined {
  for (const key of ['website', 'url', 'link', 'sourceUrl']) {
    const value = str(record[key]);
    if (isRealUrl(value)) return value;
  }
  return undefined;
}

function recordText(record: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ['name', 'title', 'industry', 'address', 'city', 'country', 'phone', 'email', 'website', 'url', 'description', 'summary', 'source']) {
    const value = str(record[key]);
    if (value) parts.push(`${key}: ${value}`);
  }
  return parts.join('; ');
}

/** Splits provider output into real, checkable results and dropped ones with reasons. */
export function filterRealResults(results: unknown[]): { kept: Array<Record<string, unknown>>; dropped: DroppedResult[] } {
  const kept: Array<Record<string, unknown>> = [];
  const dropped: DroppedResult[] = [];
  for (const item of results) {
    if (!item || typeof item !== 'object') {
      dropped.push({ reason: 'not a record', label: 'unknown' });
      continue;
    }
    const record = item as Record<string, unknown>;
    const name = str(record.name) || str(record.title);
    const label = name || 'unnamed';
    if (name.length < 2) {
      dropped.push({ reason: 'missing name', label });
      continue;
    }
    if (FAKE_MARKERS.test(recordText(record))) {
      dropped.push({ reason: 'contains placeholder text', label });
      continue;
    }
    if (!str(record.source)) {
      dropped.push({ reason: 'no named source', label });
      continue;
    }
    const anchored = Boolean(pickUrl(record)) || Boolean(str(record.phone)) || Boolean(str(record.address));
    if (!anchored) {
      dropped.push({ reason: 'nothing checkable (no real URL, phone or address)', label });
      continue;
    }
    kept.push(record);
  }
  return { kept, dropped };
}

export function buildEvidence(results: Array<Record<string, unknown>>, max = 12): Evidence[] {
  return results.slice(0, max).map((record, index) => ({
    id: `E${index + 1}`,
    name: str(record.name) || str(record.title),
    url: pickUrl(record),
    source: str(record.source) || undefined,
    text: recordText(record).slice(0, 700),
  }));
}

export function evidenceBlock(evidence: Evidence[]): string {
  if (!evidence.length) return 'EVIDENCE: none retrieved.';
  return 'EVIDENCE:\n' + evidence.map((item) => `[${item.id}] ${item.text}${item.url ? ` | url: ${item.url}` : ''}`).join('\n');
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_PATTERN = /https?:\/\/[^\s)>\]"']+/gi;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const digits = (value: string) => value.replace(/\D/g, '');
const cleanUrl = (value: string) => value.toLowerCase().replace(/[.,;:!?]+$/, '').replace(/\/$/, '');

/** Removes emails, phone numbers and URLs that do not appear in the evidence. */
export function groundText(text: string, evidence: Evidence[]): { text: string; removed: string[] } {
  const haystack = evidence.map((item) => `${item.text} ${item.url ?? ''}`).join(' \n ').toLowerCase();
  const haystackDigits = digits(haystack);
  const removed: string[] = [];
  const mark = (token: string) => {
    removed.push(token);
    return '[removed: not in sources]';
  };
  let out = text.replace(URL_PATTERN, (token) => (haystack.includes(cleanUrl(token)) ? token : mark(token)));
  out = out.replace(EMAIL, (token) => (haystack.includes(token.toLowerCase()) ? token : mark(token)));
  out = out.replace(PHONE, (token) => {
    const d = digits(token);
    return d.length >= 8 && haystackDigits.includes(d) ? token : d.length >= 8 ? mark(token) : token;
  });
  return { text: out, removed };
}

export type Pick = { evidenceId: string; name: string; url?: string; why: string; nextStep: string };
export type GroundedBrief = { summary: string; picks: Pick[]; removed: string[]; usedModel: boolean };

/** Validates a model's JSON answer against the evidence. Unknown evidence ids are discarded. */
export function groundBrief(raw: unknown, evidence: Evidence[]): GroundedBrief | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as { summary?: unknown; picks?: unknown };
  const byId = new Map(evidence.map((item) => [item.id, item]));
  const removed: string[] = [];
  const clean = (value: unknown, limit: number) => {
    const grounded = groundText(str(value).slice(0, limit), evidence);
    removed.push(...grounded.removed);
    return grounded.text;
  };
  const summary = clean(data.summary, 700);
  if (!summary) return null;
  const picks: Pick[] = [];
  if (Array.isArray(data.picks)) {
    for (const entry of data.picks.slice(0, 5)) {
      const pick = entry as { evidence_id?: unknown; evidenceId?: unknown; why?: unknown; next_step?: unknown; nextStep?: unknown };
      const id = str(pick.evidence_id ?? pick.evidenceId).toUpperCase();
      const source = byId.get(id);
      if (!source) continue;
      picks.push({ evidenceId: id, name: source.name, url: source.url, why: clean(pick.why, 300), nextStep: clean(pick.next_step ?? pick.nextStep, 240) });
    }
  }
  return { summary, picks, removed, usedModel: true };
}

/** Used when no language model is available: states only what was retrieved. */
export function deterministicBrief(query: string, evidence: Evidence[]): GroundedBrief {
  if (!evidence.length) {
    return { summary: `No verifiable results were found for "${query}". Nothing was invented. Try a more specific business type and city.`, picks: [], removed: [], usedModel: false };
  }
  return {
    summary: `Found ${evidence.length} source-backed result${evidence.length === 1 ? '' : 's'} for "${query}". Each one links to a public source or listing you can open and check.`,
    picks: evidence.slice(0, 3).map((item) => ({ evidenceId: item.id, name: item.name, url: item.url, why: `Listed by ${item.source ?? 'a public source'}.`, nextStep: item.url ? 'Open the source and confirm the details.' : 'Confirm the details with the listed phone or address.' })),
    removed: [],
    usedModel: false,
  };
}
