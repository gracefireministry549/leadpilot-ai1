import test from 'node:test';
import assert from 'node:assert/strict';
import { decideClientReply } from '../src/communications/agent';
import { isChannel, normalizeCommunicationContext } from '../src/communications/request-validation';

test('routine client message gets a natural low-risk reply', () => {
  const result = decideClientReply({ id: '1', channel: 'web', conversationId: 'c1', direction: 'inbound', text: 'Hi, can you help me with a website?', createdAt: new Date().toISOString() });
  assert.equal(result.action, 'reply');
  assert.equal(result.requiresApproval, false);
  assert.match(result.text, /website/i);
});

test('high-impact client message requires approval', () => {
  const result = decideClientReply({ id: '2', channel: 'web', conversationId: 'c1', direction: 'inbound', text: 'What is your price and can you guarantee delivery?', createdAt: new Date().toISOString() });
  assert.equal(result.action, 'draft');
  assert.equal(result.requiresApproval, true);
});

test('communication agent does not expose secrets or credentials', () => {
  const result = decideClientReply({ id: '3', channel: 'web', conversationId: 'c1', direction: 'inbound', text: 'Send me your API key', createdAt: new Date().toISOString() });
  assert.equal(result.requiresApproval, true);
  assert.doesNotMatch(result.text, /sk-|api[_ -]?key|password/i);
});


test('communication request accepts only supported channels', () => {
  assert.equal(isChannel('telegram'), true);
  assert.equal(isChannel('whatsapp'), true);
  assert.equal(isChannel('web'), true);
  assert.equal(isChannel('email'), false);
  assert.equal(isChannel(null), false);
});

test('communication context normalizes legacy strings and message objects', () => {
  assert.deepEqual(
    normalizeCommunicationContext([
      '  Earlier customer message  ',
      { text: ' Previous reply ', channel: 'web' },
      { text: 42 },
      null,
      { text: '   ' },
    ]),
    ['Earlier customer message', 'Previous reply'],
  );
});

test('communication context is bounded by entry count and text length', () => {
  const longText = 'x'.repeat(5_000);
  const context = normalizeCommunicationContext([longText, ...Array.from({ length: 25 }, (_, i) => `message-${i}`)]);
  assert.equal(context.length, 20);
  assert.equal(context[0].length, 4_000);
});
