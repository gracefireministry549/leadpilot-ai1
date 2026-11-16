import test from 'node:test';
import assert from 'node:assert/strict';
import { ALLOWED_FILE_TYPES, FILE_BUCKET, MAX_FILE_BYTES, sanitizeFileName } from './file-policy';

test('file policy keeps uploads inside the free-tier guardrails', () => {
  assert.equal(FILE_BUCKET, 'leadpilot-files');
  assert.equal(MAX_FILE_BYTES, 10 * 1024 * 1024);
  assert.equal(ALLOWED_FILE_TYPES.has('application/pdf'), true);
  assert.equal(ALLOWED_FILE_TYPES.has('application/x-msdownload'), false);
});

test('file names are reduced to safe leaf names', () => {
  assert.equal(sanitizeFileName('../../private/report.pdf'), 'report.pdf');
  assert.equal(sanitizeFileName('folder\\unsafe name?.pdf'), 'unsafe name_.pdf');
  assert.equal(sanitizeFileName('...'), 'upload');
});
