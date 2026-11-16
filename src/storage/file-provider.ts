import type { SupabaseClient } from '@supabase/supabase-js';
import { FILE_BUCKET } from './file-policy';

/**
 * Storage-provider boundary. Supabase is the active free-tier provider.
 * A second S3-compatible provider can implement this contract after its free
 * account and credentials are explicitly configured; no paid fallback occurs.
 */
export interface FileStorageProvider {
  readonly id: 'supabase' | 's3_compatible';
  upload(key: string, file: File, contentType: string): Promise<void>;
  createDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  remove(key: string): Promise<void>;
}

export class SupabaseFileStorageProvider implements FileStorageProvider {
  readonly id = 'supabase' as const;

  constructor(private readonly client: SupabaseClient) {}

  async upload(key: string, file: File, contentType: string): Promise<void> {
    const { error } = await this.client.storage.from(FILE_BUCKET).upload(key, file, {
      contentType,
      upsert: false,
    });
    if (error) throw new Error('File upload failed.');
  }

  async createDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this.client.storage
      .from(FILE_BUCKET)
      .createSignedUrl(key, expiresInSeconds, { download: true });
    if (error || !data?.signedUrl) throw new Error('Unable to create a download link.');
    return data.signedUrl;
  }

  async remove(key: string): Promise<void> {
    const { error } = await this.client.storage.from(FILE_BUCKET).remove([key]);
    if (error) throw new Error('Unable to remove stored file.');
  }
}

export function getFileStorageProvider(client: SupabaseClient): FileStorageProvider {
  const configured = process.env.FILE_STORAGE_PROVIDER ?? 'supabase';
  if (configured !== 'supabase') {
    throw new Error('The configured secondary storage provider is not activated.');
  }
  return new SupabaseFileStorageProvider(client);
}
