import { NextResponse } from 'next/server';
import { postTrendLeadsSearch } from '../../../../src/api/trend-lead-route';
import { createSupabaseServerClient, getSupabaseAuthenticatedUser } from '../../../../src/auth/supabase-server';
import { getActiveCompanyMembership } from '../../../../src/auth/company-membership';
import { configuredLeadProviders } from '../../../../src/providers/configured-provider';
import { rateLimit } from '../../../../src/cache/redis';

const MAX_BODY_BYTES = 16_384;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });

  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 });
  }

  const user = await getSupabaseAuthenticatedUser(request);
  const clientKey = request.headers.get('cf-connecting-ip') || (user ? user.id : 'anonymous');
  const rate = await rateLimit('rate:trend-leads-search:' + clientKey, 20, 3600);
  if (!rate.allowed) return NextResponse.json({ error: 'Search limit reached. Try again later.' }, { status: 429 });

  const input = body as Record<string, unknown>;
  const safeBody = {
    ...input,
    query: typeof input.query === 'string' ? input.query.slice(0, 2_000) : input.query,
    keywords: typeof input.keywords === 'string' ? input.keywords.slice(0, 2_000) : input.keywords,
    industry: typeof input.industry === 'string' ? input.industry.slice(0, 120) : input.industry,
    country: typeof input.country === 'string' ? input.country.slice(0, 120) : input.country,
    city: typeof input.city === 'string' ? input.city.slice(0, 120) : input.city,
    location: typeof input.location === 'string' ? input.location.slice(0, 120) : input.location,
    limit: typeof input.limit === 'number' && Number.isFinite(input.limit) ? Math.min(100, Math.max(1, Math.floor(input.limit))) : input.limit,
  };
  // Resolve the company (not the user id) so persistence targets the company
  // workspace and records the user as created_by.
  let auth: { accountId: string; userId: string } | null = null;
  if (user) {
    const supabase = await createSupabaseServerClient();
    const { data: membership } = await getActiveCompanyMembership(supabase, user.id);
    if (membership?.company_id) auth = { accountId: membership.company_id, userId: user.id };
  }
  const result = await postTrendLeadsSearch(
    { method: 'POST', body: safeBody },
    auth,
    configuredLeadProviders(),
  );
  return NextResponse.json(result.body, { status: result.status });
}
