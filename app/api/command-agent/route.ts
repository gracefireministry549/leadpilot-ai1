import { NextResponse } from 'next/server';
import { createSupabaseServerClient, getSupabaseAuthenticatedUser } from '../../../src/auth/supabase-server';
import { runCommand } from '../../../src/agents/command-agent';
import { rateLimit } from '../../../src/cache/redis';

const RUNNER_ROLES = new Set(['owner', 'admin', 'member']);
const MAX_COMMAND_LENGTH = 2_000;

export async function POST(request: Request) {
  const user = await getSupabaseAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in before running an AI command.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 });
  }
  const command = typeof body.command === 'string' ? body.command.trim() : '';
  if (!command) return NextResponse.json({ error: 'Describe what you want the agent to do.' }, { status: 400 });
  if (command.length > MAX_COMMAND_LENGTH) {
    return NextResponse.json({ error: `Command must be no longer than ${MAX_COMMAND_LENGTH} characters.` }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: membership, error: membershipError } = await supabase
    .from('company_memberships').select('company_id,role').eq('user_id', user.id)
    .eq('status', 'active').limit(1).maybeSingle();
  if (membershipError) return NextResponse.json({ error: 'Could not verify company access.' }, { status: 503 });
  if (!membership || !RUNNER_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'An active company membership is required to run AI commands.' }, { status: 403 });
  }

  const limit = Number(process.env.AGENT_RATE_LIMIT_PER_HOUR || 30);
  const rate = await rateLimit(`rate:command:${membership.company_id}:${user.id}`, limit, 3600);
  if (!rate.allowed) return NextResponse.json({ error: `You have reached the limit of ${limit} AI commands per hour.` }, { status: 429 });

  const requestedLimit = typeof body.limit === 'number' && Number.isFinite(body.limit) ? Math.floor(body.limit) : 10;
  const result = await runCommand({ accountId: membership.company_id, userId: user.id }, command, {
    location: typeof body.location === 'string' ? body.location.slice(0, 160) : undefined,
    city: typeof body.city === 'string' ? body.city.slice(0, 120) : undefined,
    country: typeof body.country === 'string' ? body.country.slice(0, 120) : undefined,
    industry: typeof body.industry === 'string' ? body.industry.slice(0, 120) : undefined,
    limit: Math.min(25, Math.max(1, requestedLimit)),
  });
  return NextResponse.json(result);
}
