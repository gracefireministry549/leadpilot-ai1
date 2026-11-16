import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../src/auth/supabase-server';
import { ALLOWED_FILE_TYPES, FILE_BUCKET, MAX_FILE_BYTES, sanitizeFileName } from '../../../src/storage/file-policy';
import { getFileStorageProvider } from '../../../src/storage/file-provider';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Sign in to view files.' }, { status: 401 });

  const { data, error } = await supabase
    .from('file_objects')
    .select('id,original_name,mime_type,size_bytes,storage_provider,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: 'Unable to list files.' }, { status: 500 });
  return NextResponse.json({ files: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Sign in to upload files.' }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const entry = form?.get('file');
  if (!(entry instanceof File)) return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
  if (entry.size < 1 || entry.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'Files must be between 1 byte and 10 MB.' }, { status: 413 });
  }
  if (!ALLOWED_FILE_TYPES.has(entry.type)) {
    return NextResponse.json({ error: 'This file type is not supported.' }, { status: 415 });
  }

  const originalName = sanitizeFileName(entry.name);
  const objectKey = user.id + '/' + crypto.randomUUID() + '/' + originalName;
  const provider = getFileStorageProvider(supabase);

  try {
    await provider.upload(objectKey, entry, entry.type);
    const { data, error } = await supabase.from('file_objects').insert({
      user_id: user.id,
      storage_provider: provider.id,
      bucket_id: FILE_BUCKET,
      object_key: objectKey,
      original_name: originalName,
      mime_type: entry.type,
      size_bytes: entry.size,
    }).select('id,original_name,mime_type,size_bytes,storage_provider,created_at').single();

    if (error || !data) {
      await provider.remove(objectKey).catch(() => undefined);
      return NextResponse.json({ error: 'File metadata could not be saved.' }, { status: 500 });
    }
    return NextResponse.json({ file: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'File upload is temporarily unavailable.' }, { status: 503 });
  }
}
