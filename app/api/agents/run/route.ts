import { NextResponse } from 'next/server';
import { createSupabaseServerClient, getSupabaseAuthenticatedUser } from '../../../../src/auth/supabase-server';
import { runAgent } from '../../../../src/agents/runtime';
import { getAgent } from '../../../../src/agents/registry';
import { rateLimit } from '../../../../src/cache/redis';

const RUNNER_ROLES = new Set(['owner', 'admin', 'member']);
const MAX_QUERY_LENGTH = 2_000;
const MAX_BODY_BYTES = 16_384;

export async function POST(request: Request) {
  const user = await getSupabaseAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
  }
  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;

  const supabase = await createSupabaseServerClient();
  const { data: membership, error: membershipError } = await supabase
    .from('company_memberships').select('company_id,role').eq('user_id', user.id)
    .eq('status', 'active').limit(1).maybeSingle();
  if (membershipError) return NextResponse.json({ error: 'Could not verify company access.' }, { status: 503 });
  if (!membership || !RUNNER_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'An active company membership is required to run agents.' }, { status: 403 });
  }

  const agent = typeof payload.agent === 'string' ? payload.agent : 'lead-finder';
  if (!getAgent(agent as Parameters<typeof getAgent>[0])) {
    return NextResponse.json({ error: 'Unknown agent.' }, { status: 400 });
  }
  const query = typeof payload.query === 'string' ? payload.query.trim() : '';
  if (!query) return NextResponse.json({ error: 'Enter what you want the agent to find.' }, { status: 400 });
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: `Query must be no longer than ${MAX_QUERY_LENGTH} characters.` }, { status: 400 });
  }

  const configuredLimit = Number(process.env.AGENT_RATE_LIMIT_PER_HOUR || 30);
  const limit = Number.isFinite(configuredLimit) ? Math.max(1, Math.min(500, Math.floor(configuredLimit))) : 30;
  const rate = await rateLimit(`rate:agent-api:${membership.company_id}:${user.id}`, limit, 3600);
  if (!rate.allowed) return NextResponse.json({ error: `You have reached the limit of ${limit} agent runs per hour.` }, { status: 429 });

  const requestedLimit = typeof payload.limit === 'number' && Number.isFinite(payload.limit) ? Math.floor(payload.limit) : 10;
  const result = await runAgent({ accountId: membership.company_id, userId: user.id }, {
    agent: agent as Parameters<typeof runAgent>[1]['agent'], query,
    location: typeof payload.location === 'string' ? payload.location.slice(0, 160) : undefined,
    city: typeof payload.city === 'string' ? payload.city.slice(0, 120) : undefined,
    country: typeof payload.country === 'string' ? payload.country.slice(0, 120) : undefined,
    industry: typeof payload.industry === 'string' ? payload.industry.slice(0, 120) : undefined,
    limit: Math.min(25, Math.max(1, requestedLimit)),
    website: typeof payload.website === 'string' ? payload.website.slice(0, 500) : undefined,
    phone: typeof payload.phone === 'string' ? payload.phone.slice(0, 80) : undefined,
    email: typeof payload.email === 'string' ? payload.email.slice(0, 254) : undefined,
    address: typeof payload.address === 'string' ? payload.address.slice(0, 300) : undefined,
    dealStatus: typeof payload.dealStatus === 'string' ? payload.dealStatus as Parameters<typeof runAgent>[1]['dealStatus'] : undefined,
  });
  if ('body' in result && 'status' in result) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json(result);
}
