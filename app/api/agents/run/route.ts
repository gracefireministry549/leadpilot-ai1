import { NextResponse } from 'next/server';
import { createSupabaseServerClient, getSupabaseAuthenticatedUser } from '../../../../src/auth/supabase-server';
import { runAgent } from '../../../../src/agents/runtime';
import { getAgent } from '../../../../src/agents/registry';

const RUNNER_ROLES = new Set(['owner', 'admin', 'member']);
const MAX_QUERY_LENGTH = 2_000;

export async function POST(request: Request) {
  const user = await getSupabaseAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: membership, error: membershipError } = await supabase
    .from('company_memberships')
    .select('company_id,role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (membershipError) return NextResponse.json({ error: 'Could not verify company access.' }, { status: 503 });
  if (!membership || !RUNNER_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'An active company membership is required to run agents.' }, { status: 403 });
  }

  const agent = typeof body.agent === 'string' ? body.agent : 'lead-finder';
  if (!getAgent(agent as Parameters<typeof getAgent>[0])) {
    return NextResponse.json({ error: 'Unknown agent.' }, { status: 400 });
  }
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) return NextResponse.json({ error: 'Enter what you want the agent to find.' }, { status: 400 });
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: `Query must be no longer than ${MAX_QUERY_LENGTH} characters.` }, { status: 400 });
  }

  const requestedLimit = typeof body.limit === 'number' && Number.isFinite(body.limit) ? Math.floor(body.limit) : 10;
  const result = await runAgent({ accountId: membership.company_id, userId: user.id }, {
    agent: agent as Parameters<typeof runAgent>[1]['agent'],
    query,
    location: typeof body.location === 'string' ? body.location.slice(0, 160) : undefined,
    city: typeof body.city === 'string' ? body.city.slice(0, 120) : undefined,
    country: typeof body.country === 'string' ? body.country.slice(0, 120) : undefined,
    industry: typeof body.industry === 'string' ? body.industry.slice(0, 120) : undefined,
    limit: Math.min(25, Math.max(1, requestedLimit)),
    website: typeof body.website === 'string' ? body.website.slice(0, 500) : undefined,
    phone: typeof body.phone === 'string' ? body.phone.slice(0, 80) : undefined,
    email: typeof body.email === 'string' ? body.email.slice(0, 254) : undefined,
    address: typeof body.address === 'string' ? body.address.slice(0, 300) : undefined,
    dealStatus: typeof body.dealStatus === 'string' ? body.dealStatus as Parameters<typeof runAgent>[1]['dealStatus'] : undefined,
  });

  if ('body' in result && 'status' in result) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json(result);
}
