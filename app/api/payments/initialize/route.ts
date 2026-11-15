import { NextResponse } from 'next/server';
import { verifyOfferToken } from '../../../../src/agents/offer-link';

const MAX_BODY_BYTES = 16_384;
function clean(value: unknown, max = 300) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: 'Payment provider is not configured.' }, { status: 503 });

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
    const contentType = request.headers.get('content-type') || '';
    const parsed: unknown = contentType.includes('application/json')
      ? JSON.parse(raw)
      : Object.fromEntries(new URLSearchParams(raw).entries());
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'A valid checkout request is required.' }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'A valid checkout request is required.' }, { status: 400 });
  }

  const email = clean(body.email, 254);
  const name = clean(body.name, 120);
  const token = clean(body.offerToken, 4_000);
  const verified = token ? verifyOfferToken(token) : null;
  if (!verified) return NextResponse.json({ error: 'This offer link is invalid or expired.' }, { status: 400 });
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });

  // Never trust amount, currency, owner, lead or agent values supplied by the browser.
  const amount = Number(verified.amount);
  const currency = clean(verified.currency, 3).toUpperCase();
  const offer = clean(verified.offer, 160);
  const leadId = clean(verified.leadId, 120);
  const agentId = clean(verified.agentId, 120);
  const userId = clean(verified.userId, 36);
  if (!Number.isInteger(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency) || !leadId || !userId) {
    return NextResponse.json({ error: 'This offer has invalid payment details. Request a new link.' }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const reference = 'VA-' + crypto.randomUUID().replaceAll('-', '');
  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        amount: String(amount),
        currency,
        reference,
        callback_url: origin + '/offer/success?reference=' + encodeURIComponent(reference),
        metadata: { customer_name: name, offer, user_id: userId, lead_id: leadId, agent_id: agentId },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.status || !data.data?.authorization_url) {
      return NextResponse.json({ error: 'Unable to initialize payment. Please try again.' }, { status: 502 });
    }
    return NextResponse.json({ authorization_url: data.data.authorization_url, access_code: data.data.access_code, reference });
  } catch {
    return NextResponse.json({ error: 'Payment provider is temporarily unavailable.' }, { status: 502 });
  }
}
