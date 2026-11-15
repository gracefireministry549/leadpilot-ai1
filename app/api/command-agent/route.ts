import { NextResponse } from 'next/server';
import { createSupabaseServerClient, getSupabaseAuthenticatedUser } from '../../../src/auth/supabase-server';
import { runCommand } from '../../../src/agents/command-agent';
import { rateLimit } from '../../../src/cache/redis';
import { getActiveCompanyMembership } from '../../../src/auth/company-membership';

const RUNNER_ROLES = new Set(['owner', 'admin', 'member']);
const MAX_COMMAND_LENGTH = 2_000;
const MAX_BODY_BYTES = 16_384;

export async function POST(request: Request) {
  const user = await getSupabaseAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in before running an AI command.' }, { status: 401 });
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
  const command = typeof payload.command === 'string' ? payload.command.trim() : '';
  if (!command) return NextResponse.json({ error: 'Describe what you want the agent to do.' }, { status: 400 });
  if (command.length > MAX_COMMAND_LENGTH) {
    return NextResponse.json({ error: `Command must be no longer than ${MAX_COMMAND_LENGTH} characters.` }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const requestedCompanyId = typeof payload.companyId === 'string' ? payload.companyId.trim() : undefined;
  const { data: membership, error: membershipError } = await getActiveCompanyMembership(supabase, user.id, requestedCompanyId);
  if (membershipError) return NextResponse.json({ error: 'Could not verify company access.' }, { status: 503 });
  if (!membership || !RUNNER_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'An active company membership is required to run AI commands.' }, { status: 403 });
  }

  const configuredLimit = Number(process.env.AGENT_RATE_LIMIT_PER_HOUR || 30);
  const limit = Number.isFinite(configuredLimit) ? Math.max(1, Math.min(500, Math.floor(configuredLimit))) : 30;
  const rate = await rateLimit(`rate:command:${membership.company_id}:${user.id}`, limit, 3600);
  if (!rate.allowed) return NextResponse.json({ error: `You have reached the limit of ${limit} AI commands per hour.` }, { status: 429 });

  const requestedLimit = typeof payload.limit === 'number' && Number.isFinite(payload.limit) ? Math.floor(payload.limit) : 10;
  const result = await runCommand({ accountId: membership.company_id, userId: user.id }, command, {
    location: typeof payload.location === 'string' ? payload.location.slice(0, 160) : undefined,
    city: typeof payload.city === 'string' ? payload.city.slice(0, 120) : undefined,
    country: typeof payload.country === 'string' ? payload.country.slice(0, 120) : undefined,
    industry: typeof payload.industry === 'string' ? payload.industry.slice(0, 120) : undefined,
    limit: Math.min(25, Math.max(1, requestedLimit)),
  });
  return NextResponse.json(result);
}
