import { NextResponse } from 'next/server';
import { getSupabaseAuthenticatedUser } from '../../../../src/auth/supabase-server';

export async function GET(request: Request) {
  const user = await getSupabaseAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const url = new URL(request.url);
  const reference = url.searchParams.get('reference')?.trim() || '';
  if (!reference || reference.length > 200) return NextResponse.json({ error: 'A valid payment reference is required.' }, { status: 400 });

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: 'Payment verification is not configured.' }, { status: 503 });

  try {
    const response = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(reference), {
      headers: { Authorization: 'Bearer ' + secret },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.status || !payload.data) {
      return NextResponse.json({ error: 'Unable to verify payment.' }, { status: 502 });
    }

    const payment = payload.data as Record<string, unknown>;
    const metadata = payment.metadata && typeof payment.metadata === 'object'
      ? payment.metadata as Record<string, unknown>
      : {};
    const ownerId = typeof metadata.user_id === 'string' ? metadata.user_id : typeof metadata.userId === 'string' ? metadata.userId : '';
    if (ownerId !== user.id) return NextResponse.json({ error: 'This payment does not belong to the signed-in account.' }, { status: 403 });

    if (payment.status !== 'success') {
      return NextResponse.json({ paid: false, status: payment.status, reference }, { status: 200 });
    }

    // Accounting is performed once by the signed, idempotent webhook, never by this GET endpoint.
    return NextResponse.json({
      paid: true,
      reference,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      accounting: 'webhook_pending_or_recorded',
    });
  } catch {
    return NextResponse.json({ error: 'Payment verification is temporarily unavailable.' }, { status: 502 });
  }
}
