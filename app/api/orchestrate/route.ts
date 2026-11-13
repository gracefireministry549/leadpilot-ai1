import { NextRequest, NextResponse } from 'next/server';
import { orchestrate } from '../../../src/agents/orchestrator';
import { unauthorizedUnlessSignedIn } from '../../../src/auth/require-user';

export async function POST(request: NextRequest) {
  const denied = await unauthorizedUnlessSignedIn(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    if (!body?.request || typeof body.request !== 'string') {
      return NextResponse.json({ error: 'request is required' }, { status: 400 });
    }
    const result = await orchestrate({
      request: body.request,
      mode: body.mode,
      approvalRequired: body.approvalRequired,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Orchestration failed' }, { status: 500 });
  }
}
