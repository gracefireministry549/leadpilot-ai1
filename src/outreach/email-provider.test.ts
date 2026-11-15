import assert from 'node:assert/strict';
import test from 'node:test';
import { ResendEmailProvider } from './email-provider';

test('Resend provider sends a stable idempotency key', async () => {
  let requestHeaders: Headers | undefined;
  let requestBody: unknown;
  const provider = new ResendEmailProvider('test-key', 'LeadPilot <test@example.com>', async (_input, init) => {
    requestHeaders = new Headers(init?.headers);
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: 'email-123' }), { status: 200 });
  });
  const result = await provider.send(
    { to: 'lead@example.com', subject: 'Hello', text: 'A short approved message.' },
    { idempotencyKey: 'leadpilot-outreach-approval-123' },
  );
  assert.equal(result.id, 'email-123');
  assert.equal(requestHeaders?.get('Idempotency-Key'), 'leadpilot-outreach-approval-123');
  assert.deepEqual(requestBody, {
    from: 'LeadPilot <test@example.com>',
    to: ['lead@example.com'],
    subject: 'Hello',
    text: 'A short approved message.',
  });
});

test('provider failures remain retryable', async () => {
  const provider = new ResendEmailProvider('test-key', 'LeadPilot <test@example.com>', async () =>
    new Response(JSON.stringify({ message: 'temporary provider error' }), { status: 503 }),
  );
  await assert.rejects(() => provider.send(
    { to: 'lead@example.com', subject: 'Hello', text: 'A short approved message.' },
    { idempotencyKey: 'leadpilot-outreach-approval-123' },
  ));
});
