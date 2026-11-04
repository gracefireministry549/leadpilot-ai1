import { NextResponse } from 'next/server';
import { getSupabaseAuthenticatedUser } from '../../../../src/auth/supabase-server';
import { runAgent } from '../../../../src/agents/runtime';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const user = await getSupabaseAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await (await import('../../../../src/auth/supabase-server')).createSupabaseServerClient();
  const { data: membership } = await supabase.from('company_memberships').select('company_id').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Create or join a company before running agents.' }, { status: 403 });
  const agent = typeof body.agent === 'string' ? body.agent : 'lead-finder';
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) return NextResponse.json({ error: 'Enter what you want the agent to find.' }, { status: 400 });

  const result = await runAgent({ accountId: membership.company_id }, {
    agent, query,
    location: typeof body.location === 'string' ? body.location : undefined,
    city: typeof body.city === 'string' ? body.city : undefined,
    country: typeof body.country === 'string' ? body.country : undefined,
    industry: typeof body.industry === 'string' ? body.industry : undefined,
    limit: typeof body.limit === 'number' ? body.limit : 10,
    website: typeof body.website === 'string' ? body.website : undefined,
    phone: typeof body.phone === 'string' ? body.phone : undefined,
    email: typeof body.email === 'string' ? body.email : undefined,
    address: typeof body.address === 'string' ? body.address : undefined,
    dealStatus: typeof body.dealStatus === 'string' ? body.dealStatus : undefined,
  });

  if ('body' in result && 'status' in result) return NextResponse.json(result.body, { status: result.status });
  return NextResponse.json(result);
}
