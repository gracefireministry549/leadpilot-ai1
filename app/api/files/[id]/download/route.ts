import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../../src/auth/supabase-server';
import { getFileStorageProvider } from '../../../../../src/storage/file-provider';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Sign in to download files.' }, { status: 401 });

  const { id } = await context.params;
  const { data: file, error } = await supabase
    .from('file_objects')
    .select('object_key,storage_provider')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error || !file) return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  if (file.storage_provider !== 'supabase') {
    return NextResponse.json({ error: 'This storage provider is not configured.' }, { status: 503 });
  }

  try {
    const url = await getFileStorageProvider(supabase).createDownloadUrl(file.object_key, 60);
    return NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to prepare the download.' }, { status: 503 });
  }
}
