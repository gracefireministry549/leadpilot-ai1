import { NextResponse } from 'next/server';
import { runWebsiteBrand } from '../../../src/agents/website-brand';
import { unauthorizedUnlessSignedIn } from '../../../src/auth/require-user';

export async function GET(request: Request) {
  const denied = await unauthorizedUnlessSignedIn(request);
  if (denied) return denied;
  const query = new URL(request.url).searchParams.get('query')?.trim() || '';
  if (!query) return NextResponse.json({ error: 'Add a business or website description in ?query=' }, { status: 400 });
  return NextResponse.json(await runWebsiteBrand({ agent: 'website-brand', query, limit: 1 }));
}

export async function POST(request: Request) {
  const denied = await unauthorizedUnlessSignedIn(request);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) return NextResponse.json({ error: 'Enter what website and brand you want.' }, { status: 400 });
  return NextResponse.json(await runWebsiteBrand({ agent: 'website-brand', query, limit: 1 }));
}
