import { NextResponse } from 'next/server';
import { createSupabaseServerClient, getSupabaseAuthenticatedUser } from '../../../../src/auth/supabase-server';
import { configuredEmailProvider } from '../../../../src/outreach/email-provider';
import { getAgentMemoryBus } from '../../../../src/agents/memory-bus';
import { rateLimitStrict } from '../../../../src/cache/redis';

const MAX_BODY_BYTES = 16_384;
const MAX_SUBJECT_LENGTH = 180;
const MAX_MESSAGE_LENGTH = 8_000;

export async function POST(request: Request) {
  const user = await getSupabaseAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in before sending outreach.' }, { status: 401 });

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
  const leadId = typeof payload.leadId === 'string' ? payload.leadId.trim() : '';
  const approvalId = typeof payload.approvalId === 'string' ? payload.approvalId.trim() : '';
  const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!leadId || !approvalId) {
    return NextResponse.json({ error: 'leadId and an approved approvalId are required.' }, { status: 400 });
  }
  if (!subject || subject.length > MAX_SUBJECT_LENGTH || !text || text.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: 'Provide a subject (up to 180 characters) and message (up to 8,000 characters).' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: membership, error: membershipError } = await supabase
    .from('company_memberships').select('company_id,role').eq('user_id', user.id)
    .eq('status', 'active').limit(1).maybeSingle();
  if (membershipError) return NextResponse.json({ error: 'Could not verify company access.' }, { status: 503 });
  if (!membership) return NextResponse.json({ error: 'Company membership required.' }, { status: 403 });

  // A client-side approval flag is not approval. Verify the persisted,
  // owner/admin-approved request and bind it to this exact lead, recipient and copy.
  const { data: approval, error: approvalError } = await supabase
    .from('approval_requests').select('id,payload,decided_by')
    .eq('id', approvalId).eq('company_id', membership.company_id)
    .eq('action_type', 'outbound_email').eq('status', 'approved').maybeSingle();
  if (approvalError) return NextResponse.json({ error: 'Could not verify approval.' }, { status: 503 });
  if (!approval?.decided_by || !approval.payload || typeof approval.payload !== 'object' || Array.isArray(approval.payload)) {
    return NextResponse.json({ error: 'A matching owner/admin-approved outreach request is required.' }, { status: 403 });
  }

  const approved = approval.payload as Record<string, unknown>;
  if (
    approved.leadId !== leadId ||
    approved.subject !== subject ||
    approved.text !== text ||
    approved.consentConfirmed !== true
  ) {
    return NextResponse.json({ error: 'The approved lead, message and consent confirmation must match exactly.' }, { status: 409 });
  }

  const { data: lead, error: leadError } = await supabase
    .from('leads').select('id,business_id,businesses(name,email,phone)')
    .eq('id', leadId).eq('company_id', membership.company_id).maybeSingle();
  if (leadError) return NextResponse.json({ error: 'Could not verify the lead.' }, { status: 503 });
  if (!lead) return NextResponse.json({ error: 'Lead not found in this company.' }, { status: 404 });

  const related = lead.businesses as unknown as { name?: string; email?: string | null; phone?: string | null } | { name?: string; email?: string | null; phone?: string | null }[] | null;
  const business = Array.isArray(related) ? related[0] : related;
  const email = business?.email?.trim().toLowerCase();
  if (!email || approved.to !== email) {
    return NextResponse.json({ error: 'The approved recipient must match the lead email address.' }, { status: 409 });
  }

  const provider = configuredEmailProvider();
  if (!provider) {
    return NextResponse.json({ error: 'Email sending is not configured. No message was sent.' }, { status: 503 });
  }

  const dailyRate = await rateLimitStrict('rate:outreach:' + membership.company_id + ':' + user.id, 10, 86_400);
  if (!dailyRate.allowed) {
    return NextResponse.json({ error: 'Outreach is temporarily unavailable or the daily sending limit has been reached.' }, { status: 429 });
  }
  const approvalRate = await rateLimitStrict('rate:outreach-approval:' + approvalId, 1, 31_536_000);
  if (!approvalRate.allowed) {
    return NextResponse.json({ error: 'Outreach is temporarily unavailable or the daily sending limit has been reached.' }, { status: 429 });
  }

  try {
    const sent = await provider.send({ to: email, subject, text });
    await getAgentMemoryBus().appendEvent({
      accountId: membership.company_id,
      leadId,
      agent: 'outreach',
      type: 'outreach.sent',
      payload: { provider: 'resend', messageId: sent.id, approvalId },
    });
    return NextResponse.json({ sent: true, messageId: sent.id }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'Email delivery could not be confirmed. Check provider status before retrying.' }, { status: 502 });
  }
}
