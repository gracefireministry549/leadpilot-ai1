import { NextResponse } from 'next/server';
import { createSupabaseServerClient, getSupabaseAuthenticatedUser } from '../../../../src/auth/supabase-server';
import { createOfferToken } from '../../../../src/agents/offer-link';

const MAX_BODY_BYTES = 16_384;

export async function POST(request: Request) {
  const user = await getSupabaseAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to create offer links.' }, { status: 401 });

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
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 });

  const input = body as Record<string, unknown>;
  const leadId = typeof input.leadId === 'string' ? input.leadId.trim() : '';
  const agentId = typeof input.agentId === 'string' ? input.agentId.trim().slice(0, 120) : undefined;
  const offer = typeof input.offer === 'string' ? input.offer.trim().slice(0, 160) : '';
  const amount = Number(input.amount);
  const currency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : 'NGN';
  if (!leadId || !offer || !Number.isInteger(amount) || amount <= 0 || amount > 100_000_000 || !/^[A-Z]{3}$/.test(currency)) {
    return NextResponse.json({ error: 'Provide a valid lead, offer, positive amount and three-letter currency.' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: membership, error: membershipError } = await supabase
    .from('company_memberships').select('company_id,role').eq('user_id', user.id)
    .eq('status', 'active').limit(1).maybeSingle();
  if (membershipError) return NextResponse.json({ error: 'Could not verify company access.' }, { status: 503 });
  if (!membership || !['owner', 'admin', 'member'].includes(membership.role)) {
    return NextResponse.json({ error: 'An active company membership is required.' }, { status: 403 });
  }

  const { data: lead, error: leadError } = await supabase.from('leads')
    .select('id').eq('id', leadId).eq('company_id', membership.company_id).maybeSingle();
  if (leadError) return NextResponse.json({ error: 'Could not verify the lead.' }, { status: 503 });
  if (!lead) return NextResponse.json({ error: 'Lead not found in this company.' }, { status: 404 });

  try {
    const token = createOfferToken({ leadId, userId: user.id, agentId, offer, amount, currency });
    const origin = new URL(request.url).origin;
    return NextResponse.json({ url: origin + '/offer/' + encodeURIComponent(token), expiresInSeconds: 604800 });
  } catch {
    return NextResponse.json({ error: 'Offer link signing is not configured.' }, { status: 503 });
  }
}
