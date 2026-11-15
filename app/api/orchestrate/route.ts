import { NextRequest, NextResponse } from 'next/server';
import { orchestrate } from '../../../src/agents/orchestrator';
import { createSupabaseServerClient, getSupabaseAuthenticatedUser } from '../../../src/auth/supabase-server';
import { rateLimit } from '../../../src/cache/redis';

const RUNNER_ROLES = new Set(['owner', 'admin', 'member']);
const MAX_REQUEST_LENGTH = 2_000;
const MODES = new Set(['lead', 'work', 'website', 'client', 'general']);

export async function POST(request: NextRequest) {
  const user = await getSupabaseAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 });
    }
    const task = typeof body.request === 'string' ? body.request.trim() : '';
    if (!task) return NextResponse.json({ error: 'request is required' }, { status: 400 });
    if (task.length > MAX_REQUEST_LENGTH) {
      return NextResponse.json({ error: `Request must be no longer than ${MAX_REQUEST_LENGTH} characters.` }, { status: 400 });
    }
    const mode = typeof body.mode === 'string' && MODES.has(body.mode) ? body.mode as 'lead' | 'work' | 'website' | 'client' | 'general' : undefined;

    const supabase = await createSupabaseServerClient();
    const { data: membership, error: membershipError } = await supabase
      .from('company_memberships').select('company_id,role').eq('user_id', user.id)
      .eq('status', 'active').limit(1).maybeSingle();
    if (membershipError) return NextResponse.json({ error: 'Could not verify company access.' }, { status: 503 });
    if (!membership || !RUNNER_ROLES.has(membership.role)) {
      return NextResponse.json({ error: 'An active company membership is required.' }, { status: 403 });
    }

    const limit = Number(process.env.AGENT_RATE_LIMIT_PER_HOUR || 30);
    const rate = await rateLimit(`rate:orchestrator:${membership.company_id}:${user.id}`, limit, 3600);
    if (!rate.allowed) return NextResponse.json({ error: `You have reached the limit of ${limit} orchestration runs per hour.` }, { status: 429 });

    const result = await orchestrate({
      request: task,
      mode,
      approvalRequired: body.approvalRequired === true,
    }, { accountId: membership.company_id, userId: user.id });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Orchestration failed' }, { status: 500 });
  }
}
