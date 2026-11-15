import { NextResponse } from 'next/server';
import { createSupabaseServerClient, getSupabaseAuthenticatedUser } from '../../../../src/auth/supabase-server';
import { getActiveCompanyMembership } from '../../../../src/auth/company-membership';

const MAX_BODY_BYTES = 16_384;

export async function POST(request: Request) {
  const user = await getSupabaseAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

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

  const input = body as Record<string, unknown>;
  const action_type = typeof input.actionType === 'string' ? input.actionType.trim().slice(0, 80) : '';
  const title = typeof input.title === 'string' ? input.title.trim().slice(0, 180) : '';
  const summary = typeof input.summary === 'string' ? input.summary.trim().slice(0, 2_000) : '';
  const payload = input.payload && typeof input.payload === 'object' && !Array.isArray(input.payload)
    ? input.payload as Record<string, unknown>
    : {};
  if (!action_type || !title || !summary) {
    return NextResponse.json({ error: 'Action type, title and summary are required.' }, { status: 400 });
  }

  if (action_type === 'outbound_email') {
    const to = typeof payload.to === 'string' ? payload.to.trim().toLowerCase() : '';
    const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    const leadId = typeof payload.leadId === 'string' ? payload.leadId.trim() : '';
    if (
      !leadId ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) ||
      !subject || subject.length > 180 ||
      !text || text.length > 8_000 ||
      payload.consentConfirmed !== true
    ) {
      return NextResponse.json({ error: 'Outbound email approval requires leadId, a valid recipient, subject, message and explicit consent confirmation.' }, { status: 400 });
    }
    payload.to = to;
    payload.subject = subject;
    payload.text = text;
    payload.leadId = leadId;
  }

  const supabase = await createSupabaseServerClient();
  const requestedCompanyId = typeof input.companyId === 'string' ? input.companyId.trim() : undefined;
  const { data: membership, error: membershipError } = await getActiveCompanyMembership(supabase, user.id, requestedCompanyId);
  if (membershipError) return NextResponse.json({ error: 'Could not verify company access.' }, { status: 503 });
  if (!membership) return NextResponse.json({ error: 'Company membership required.' }, { status: 403 });

  const { data, error } = await supabase.from('approval_requests').insert({
    company_id: membership.company_id,
    requested_by: user.id,
    action_type,
    title,
    summary,
    payload,
    status: 'pending',
  }).select('id,status').single();
  if (error || !data) return NextResponse.json({ error: 'Could not create approval request.' }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
