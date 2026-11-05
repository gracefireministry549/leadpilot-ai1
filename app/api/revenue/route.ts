import { NextResponse } from 'next/server';
import { getSupabaseAuthenticatedUser } from '../../../src/auth/supabase-server';
import { getRevenueEvents, recordRevenueEvent } from '../../../src/agents/revenue-store';
import { calculateFunnel, calculateAgentPerformance } from '../../../src/agents/revenue';

export async function GET(request: Request) {
  const user = await getSupabaseAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to view revenue analytics.' }, { status: 401 });
  const rows = await getRevenueEvents(user.id);
  const events = rows.map((r: any) => ({ leadId: r.lead_id ?? undefined, agentId: r.agent_id ?? undefined, event: r.event, value: Number(r.value || 0), currency: r.currency, occurredAt: r.occurred_at }));
  return NextResponse.json({ events, funnel: calculateFunnel(events), agentPerformance: calculateAgentPerformance(events) });
}

export async function POST(request: Request) {
  const user = await getSupabaseAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Sign in to record revenue events.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const allowed = ['qualified','draft_created','contacted','replied','meeting_booked','lost'];
  if (!allowed.includes(body.event)) return NextResponse.json({ error: 'Invalid revenue event.' }, { status: 400 });
  const row = await recordRevenueEvent(user.id, { leadId: body.leadId, agentId: body.agentId, event: body.event, value: 0, currency: 'NGN', occurredAt: body.occurredAt || new Date().toISOString() });
  return NextResponse.json({ event: row }, { status: 201 });
}
