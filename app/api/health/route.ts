import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Liveness check for deployments. Reports configuration presence only, never values. */
export async function GET() {
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
  return NextResponse.json({ ok: true, supabaseConfigured }, { headers: { 'Cache-Control': 'no-store' } });
}
