import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../src/auth/supabase-server';
import { getFileStorageProvider } from '../../../../src/storage/file-provider';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Sign in to delete files.' }, { status: 401 });

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
    await getFileStorageProvider(supabase).remove(file.object_key);
    const { error: deleteError } = await supabase.from('file_objects').delete().eq('id', id).eq('user_id', user.id);
    if (deleteError) return NextResponse.json({ error: 'File was removed from storage but metadata cleanup failed.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Unable to delete the file.' }, { status: 503 });
  }
}
