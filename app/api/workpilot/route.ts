import { NextResponse } from 'next/server';
import { runWorkPilot } from '../../../src/agents/workpilot';
import { getSupabaseAuthenticatedUser } from '../../../src/auth/supabase-server';
import { rateLimit } from '../../../src/cache/redis';

const MAX_BODY_BYTES = 16_384;

async function authorize(request: Request) {
  const user = await getSupabaseAuthenticatedUser(request);
  if (!user) return { error: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  const rate = await rateLimit('rate:workpilot:' + user.id, 30, 3600);
  if (!rate.allowed) return { error: NextResponse.json({ error: 'Hourly agent request limit reached.' }, { status: 429 }) };
  return { user };
}

export async function GET(request: Request) {
  const access = await authorize(request);
  if (access.error) return access.error;
  const params = new URL(request.url).searchParams;
  const query = params.get('query')?.trim() || '';
  if (!query) return NextResponse.json({ error: 'Add a business or task description in ?query=' }, { status: 400 });
  if (query.length > 2_000) return NextResponse.json({ error: 'Query must be no longer than 2,000 characters.' }, { status: 400 });
  const location = params.get('location')?.slice(0, 120) || undefined;\n  const rawLimit = Number(params.get('limit') || 20);\n  const limit = Number.isFinite(rawLimit) ? Math.min(25, Math.max(1, Math.floor(rawLimit))) : 20;\n  return NextResponse.json(await runWorkPilot({ agent: 'workpilot', query, location, limit }));
}

export async function POST(request: Request) {
  const access = await authorize(request);
  if (access.error) return access.error;
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 });
  const input = body as Record<string, unknown>;
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (!query) return NextResponse.json({ error: 'Enter what you want the agent to find.' }, { status: 400 });
  if (query.length > 2_000) return NextResponse.json({ error: 'Query must be no longer than 2,000 characters.' }, { status: 400 });
  const location = typeof input.location === 'string' ? input.location.slice(0, 120) : undefined;\n  const rawLimit = typeof input.limit === 'number' && Number.isFinite(input.limit) ? Math.floor(input.limit) : 20;\n  const limit = Math.min(25, Math.max(1, rawLimit));\n  return NextResponse.json(await runWorkPilot({ agent: 'workpilot', query, location, limit }));
}
