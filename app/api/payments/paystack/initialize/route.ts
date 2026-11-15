import { NextResponse } from 'next/server';
import { getSupabaseAuthenticatedUser, createSupabaseServerClient } from '../../../../../src/auth/supabase-server';
import { rateLimit } from '../../../../../src/cache/redis';
import { isSupportedPaystackCurrency, toPaystackMinorUnits } from '../../../../../src/agents/offer-link';

const MAX_BODY_BYTES = 16_384;

export async function POST(request: Request) {
  const user = await getSupabaseAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to create a checkout.' }, { status: 401 });

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: 'PAYSTACK_SECRET_KEY is not configured.' }, { status: 503 });

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'A valid checkout request is required.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'A valid checkout request is required.' }, { status: 400 });
  const input = body as Record<string, unknown>;

  const email = typeof input.email === 'string' && input.email.trim() ? input.email.trim().slice(0, 254) : user.email;
  const amount = Number(input.amount);
  const currency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : 'NGN';
  const leadId = typeof input.leadId === 'string' ? input.leadId.trim() : '';
  const agentId = typeof input.agentId === 'string' ? input.agentId.trim().slice(0, 120) : null;
  const offer = typeof input.offer === 'string' ? input.offer.trim().slice(0, 160) : null;
  const amountMinor = toPaystackMinorUnits(amount, currency);
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || amount > 100_000_000 || !amountMinor || !isSupportedPaystackCurrency(currency)) {
    return NextResponse.json({ error: 'A valid customer email, amount and supported Paystack currency are required.' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: membership, error: membershipError } = await supabase.from('company_memberships')
    .select('company_id').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
  if (membershipError) return NextResponse.json({ error: 'Could not verify company access.' }, { status: 503 });
  if (!membership) return NextResponse.json({ error: 'Company membership required.' }, { status: 403 });
  if (leadId) {
    const { data: lead, error: leadError } = await supabase.from('leads').select('id')
      .eq('id', leadId).eq('company_id', membership.company_id).maybeSingle();
    if (leadError) return NextResponse.json({ error: 'Could not verify the lead.' }, { status: 503 });
    if (!lead) return NextResponse.json({ error: 'Lead not found in this company.' }, { status: 404 });
  }

  const rate = await rateLimit('rate:payment-init:' + user.id, 10, 3600);
  if (!rate.allowed) return NextResponse.json({ error: 'Checkout request limit reached. Try again later.' }, { status: 429 });

  const origin = new URL(request.url).origin;
  const reference = 'LP-' + crypto.randomUUID().replaceAll('-', '');
  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        amount: amountMinor,
        currency,
        reference,
        callback_url: origin + '/offer/success?reference=' + encodeURIComponent(reference),
        metadata: { user_id: user.id, lead_id: leadId || null, agent_id: agentId, offer },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.status || !data.data?.authorization_url) {
      return NextResponse.json({ error: 'Unable to initialize payment. Please try again.' }, { status: 502 });
    }
    return NextResponse.json({ authorizationUrl: data.data.authorization_url, accessCode: data.data.access_code, reference });
  } catch {
    return NextResponse.json({ error: 'Payment provider is temporarily unavailable.' }, { status: 502 });
  }
}
