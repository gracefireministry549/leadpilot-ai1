import { NextRequest, NextResponse } from 'next/server';
import { orchestrate } from '../../../src/agents/orchestrator';
import { createSupabaseServerClient, getSupabaseAuthenticatedUser } from '../../../src/auth/supabase-server';
import { rateLimit } from '../../../src/cache/redis';

const RUNNER_ROLES = new Set(['owner', 'admin', 'member']);
const MAX_REQUEST_LENGTH = 2_000;
const MAX_BODY_BYTES = 16_384;
const MODES = new Set(['lead', 'work', 'website', 'client', 'general']);

export async function POST(request: NextRequest) {
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
  const task = typeof payload.request === 'string' ? payload.request.trim() : '';
  if (!task) return NextResponse.json({ error: 'request is required' }, { status: 400 });
  if (task.length > MAX_REQUEST_LENGTH) {
    return NextResponse.json({ error: `Request must be no longer than ${MAX_REQUEST_LENGTH} characters.` }, { status: 400 });
  }
  const mode = typeof payload.mode === 'string' && MODES.has(payload.mode)
    ? payload.mode as 'lead' | 'work' | 'website' | 'client' | 'general'
    : undefined;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: membership, error: membershipError } = await supabase
      .from('company_memberships').select('company_id,role').eq('user_id', user.id)
      .eq('status', 'active').limit(1).maybeSingle();
    if (membershipError) return NextResponse.json({ error: 'Could not verify company access.' }, { status: 503 });
    if (!membership || !RUNNER_ROLES.has(membership.role)) {
      return NextResponse.json({ error: 'An active company membership is required.' }, { status: 403 });
    }

    const configuredLimit = Number(process.env.AGENT_RATE_LIMIT_PER_HOUR || 30);
    const limit = Number.isFinite(configuredLimit) ? Math.max(1, Math.min(500, Math.floor(configuredLimit))) : 30;
    const rate = await rateLimit(`rate:orchestrator:${membership.company_id}:${user.id}`, limit, 3600);
    if (!rate.allowed) return NextResponse.json({ error: `You have reached the limit of ${limit} orchestration runs per hour.` }, { status: 429 });

    const result = await orchestrate({
      request: task,
      mode,
      approvalRequired: payload.approvalRequired === true,
    }, { accountId: membership.company_id, userId: user.id });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Orchestration failed. Please try again.' }, { status: 500 });
  }
}
