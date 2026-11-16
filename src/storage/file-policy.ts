export const FILE_BUCKET = 'leadpilot-files';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function sanitizeFileName(input: string): string {
  const leaf = input.split(/[\\/]/).pop() ?? '';
  const cleaned = leaf
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^a-zA-Z0-9._() -]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 120);
  return cleaned || 'upload';
}
