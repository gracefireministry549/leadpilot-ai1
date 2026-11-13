import { NextResponse } from 'next/server';
import { runWorkPilot } from '../../../src/agents/workpilot';
import { unauthorizedUnlessSignedIn } from '../../../src/auth/require-user';

export async function GET(request: Request) {
  const denied = await unauthorizedUnlessSignedIn(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const query = params.get('query')?.trim() || '';
  if (!query) return NextResponse.json({ error: 'Add a job search in ?query=' }, { status: 400 });
  return NextResponse.json(await runWorkPilot({ agent: 'workpilot', query, location: params.get('location') || undefined, limit: Number(params.get('limit') || 20) }));
}

export async function POST(request: Request) {
  const denied = await unauthorizedUnlessSignedIn(request);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) return NextResponse.json({ error: 'Enter the work you want to find.' }, { status: 400 });
  return NextResponse.json(await runWorkPilot({ agent: 'workpilot', query, location: typeof body.location === 'string' ? body.location : undefined, limit: typeof body.limit === 'number' ? body.limit : 20 }));
}
