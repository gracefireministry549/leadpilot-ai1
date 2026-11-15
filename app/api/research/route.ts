import { NextResponse } from 'next/server';
import { getSupabaseAuthenticatedUser } from '../../../src/auth/supabase-server';
import { researchWeb } from '../../../src/research/web-research';
import { rateLimit } from '../../../src/cache/redis';

const MAX_BODY_BYTES = 16_384;
const MAX_QUESTION_LENGTH = 2_000;

export async function POST(request: Request) {
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
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 });
  }

  const user = await getSupabaseAuthenticatedUser(request);
  const clientKey = request.headers.get('cf-connecting-ip') || (user ? user.id : 'anonymous');
  const rate = await rateLimit('rate:public-research:' + clientKey, 10, 3600);
  if (!rate.allowed) return NextResponse.json({ error: 'Research limit reached. Try again later.' }, { status: 429 });

  const question = typeof (body as Record<string, unknown>).question === 'string'
    ? ((body as Record<string, unknown>).question as string).trim()
    : '';
  if (!question) return NextResponse.json({ error: 'Enter a research question' }, { status: 400 });
  if (question.length > MAX_QUESTION_LENGTH) return NextResponse.json({ error: 'Research question must be no longer than 2,000 characters.' }, { status: 400 });
  try {
    return NextResponse.json(await researchWeb(question));
  } catch {
    return NextResponse.json({ error: 'Research could not be completed. Please try again.' }, { status: 502 });
  }
}
