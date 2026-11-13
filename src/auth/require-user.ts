import { NextResponse } from 'next/server';
import { getSupabaseAuthenticatedUser } from './supabase-server';

/** Returns a 401 response when the request has no valid Supabase session, otherwise null. */
export async function unauthorizedUnlessSignedIn(request: Request): Promise<NextResponse | null> {
  const user = await getSupabaseAuthenticatedUser(request);
  if (user) return null;
  return NextResponse.json({ error: 'Sign in to use this agent.' }, { status: 401 });
}
