import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const MAX_BODY_BYTES = 1_000_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server credentials are not configured.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function validSignature(raw: string, signature: string, secret: string) {
  const expected = crypto.createHmac('sha512', secret).update(raw).digest('hex');
  const suppliedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return suppliedBytes.length === expectedBytes.length && crypto.timingSafeEqual(suppliedBytes, expectedBytes);
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Webhook body is too large.' }, { status: 413 });

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Webhook body is too large.' }, { status: 413 });
  }

  const signature = request.headers.get('x-paystack-signature') || '';
  const secret = process.env.PAYSTACK_SECRET_KEY || '';
  if (!secret || !signature || !validSignature(raw, signature, secret)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 });
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  if (payload.event !== 'charge.success') return NextResponse.json({ received: true });

  const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data as Record<string, unknown>
    : {};
  const metadata = data.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
    ? data.metadata as Record<string, unknown>
    : {};
  const reference = typeof data.reference === 'string' ? data.reference.trim() : '';
  const providerId = data.id === undefined || data.id === null ? '' : String(data.id);
  const userId = typeof metadata.userId === 'string' ? metadata.userId : typeof metadata.user_id === 'string' ? metadata.user_id : '';
  const leadId = typeof metadata.leadId === 'string' ? metadata.leadId : typeof metadata.lead_id === 'string' ? metadata.lead_id : null;
  const agentId = typeof metadata.agentId === 'string' ? metadata.agentId : typeof metadata.agent_id === 'string' ? metadata.agent_id : null;
  const amount = Number(data.amount);
  const currency = typeof data.currency === 'string' ? data.currency.toUpperCase() : '';
  const paidAtValue = typeof data.paid_at === 'string' ? data.paid_at : '';
  const paidAt = paidAtValue && Number.isFinite(Date.parse(paidAtValue)) ? new Date(paidAtValue).toISOString() : new Date().toISOString();

  if (!reference || reference.length > 200) return NextResponse.json({ error: 'Missing or invalid transaction reference.' }, { status: 400 });
  if (!UUID_PATTERN.test(userId)) return NextResponse.json({ error: 'Payment has no valid owning user.' }, { status: 422 });
  if (!Number.isSafeInteger(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) {
    return NextResponse.json({ error: 'Payment amount or currency is invalid.' }, { status: 422 });
  }

  try {
    const { data: processed, error } = await db().rpc('process_paystack_success', {
      target_event_id: `charge.success:${reference}`,
      target_reference: reference,
      target_provider_transaction_id: providerId,
      target_user_id: userId,
      target_lead_id: leadId,
      target_agent_id: agentId,
      target_amount_minor: amount,
      target_currency: currency,
      target_paid_at: paidAt,
      target_payload: payload,
    });
    if (error) throw error;
    if (processed === false) return NextResponse.json({ received: true, duplicate: true });
    return NextResponse.json({ received: true, reference, status: 'success' });
  } catch {
    return NextResponse.json({ error: 'Payment event could not be recorded. Paystack may retry this webhook.' }, { status: 500 });
  }
}
