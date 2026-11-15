import Link from 'next/link';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ reference?: string }> };

export default async function OfferSuccessPage({ searchParams }: Props) {
  const { reference = '' } = await searchParams;
  let status: 'confirmed' | 'pending' | 'unavailable' = 'unavailable';
  let amount = '';
  if (reference && reference.length <= 200 && process.env.PAYSTACK_SECRET_KEY) {
    try {
      const response = await fetch('https://api.paystack.co/transaction/verify/' + encodeURIComponent(reference), {
        headers: { Authorization: 'Bearer ' + process.env.PAYSTACK_SECRET_KEY },
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result?.status && result?.data?.status === 'success') {
        status = 'confirmed';
        const value = Number(result.data.amount);
        const currency = typeof result.data.currency === 'string' ? result.data.currency : '';
        if (Number.isFinite(value) && value > 0 && currency) amount = currency + ' ' + (value / 100).toLocaleString();
      } else if (response.ok) {
        status = 'pending';
      }
    } catch {
      status = 'unavailable';
    }
  }

  const title = status === 'confirmed' ? 'Payment confirmed' : status === 'pending' ? 'Payment is still processing' : 'We could not confirm the payment yet';
  const description = status === 'confirmed'
    ? 'Paystack confirms this payment. The business owner’s dashboard is updated separately by the secure payment webhook.'
    : status === 'pending'
      ? 'Paystack has not marked this transaction as successful yet. Please wait a moment and check with the business owner before trying again.'
      : 'Keep your payment reference and check your Paystack receipt or contact the business owner. Do not pay a second time until the status is checked.';

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#07101b', color: '#edf5f8', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ width: 'min(560px, 100%)', boxSizing: 'border-box', padding: 32, borderRadius: 20, border: '1px solid #294050', background: '#0b1723' }}>
        <p style={{ color: '#7ee7c4', fontSize: 11, letterSpacing: 2, fontWeight: 800 }}>LEADPILOT SECURE CHECKOUT</p>
        <h1 style={{ fontSize: 32, margin: '12px 0' }}>{title}</h1>
        <p style={{ color: '#9bb0bf', lineHeight: 1.6 }}>{description}</p>
        {amount ? <p style={{ fontSize: 22, fontWeight: 800 }}>{amount}</p> : null}
        <p style={{ color: '#7890a2', fontSize: 12, overflowWrap: 'anywhere' }}>Reference: {reference || 'Not provided'}</p>
        <Link href="/" style={{ display: 'inline-block', marginTop: 18, color: '#7ee7c4' }}>Return to LeadPilot</Link>
      </section>
    </main>
  );
}
