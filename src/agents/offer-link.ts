import { createHmac, timingSafeEqual } from 'crypto';

type OfferLinkPayload = { leadId: string; userId?: string; agentId?: string; offer: string; amount: number; currency: string; exp: number };

// Keep this list aligned with the currencies supported by the Paystack checkout integration.
// XOF has no minor unit; the other supported currencies use two decimal places.
export const PAYSTACK_CURRENCY_MINOR_UNITS: Readonly<Record<string, number>> = {
  NGN: 2,
  USD: 2,
  GHS: 2,
  ZAR: 2,
  KES: 2,
  XOF: 0,
};

export function isSupportedPaystackCurrency(currency: string): boolean {
  return Object.hasOwn(PAYSTACK_CURRENCY_MINOR_UNITS, currency.trim().toUpperCase());
}

export function toPaystackMinorUnits(amount: number, currency: string): number | null {
  const normalizedCurrency = currency.trim().toUpperCase();
  const fractionDigits = PAYSTACK_CURRENCY_MINOR_UNITS[normalizedCurrency];
  if (!Number.isSafeInteger(amount) || amount <= 0 || fractionDigits === undefined) return null;
  const minorAmount = amount * (10 ** fractionDigits);
  return Number.isSafeInteger(minorAmount) ? minorAmount : null;
}

function secret(){ const value=process.env.OFFER_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY; if(!value) throw new Error('OFFER_LINK_SECRET is not configured.'); return value; }
function sign(value:string){ return createHmac('sha256', secret()).update(value).digest('base64url'); }
export function createOfferToken(input: Omit<OfferLinkPayload,'exp'>, ttlSeconds=604800){ const payload={...input,exp:Math.floor(Date.now()/1000)+ttlSeconds}; const body=Buffer.from(JSON.stringify(payload)).toString('base64url'); return `${body}.${sign(body)}`; }
export function verifyOfferToken(token:string): OfferLinkPayload | null { try { const [body,sig]=token.split('.'); if(!body||!sig) return null; const expected=sign(body); if(sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return null; const payload=JSON.parse(Buffer.from(body,'base64url').toString()) as OfferLinkPayload; if(!payload.leadId||!payload.offer||!Number.isInteger(payload.amount)||payload.amount<=0||payload.exp<Math.floor(Date.now()/1000)) return null; return payload; } catch { return null; } }
