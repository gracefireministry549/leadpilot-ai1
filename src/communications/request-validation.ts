import type { Channel } from './types';

const CHANNELS = new Set<Channel>(['telegram', 'whatsapp', 'web']);
const MAX_CONTEXT_MESSAGES = 20;
const MAX_CONTEXT_TEXT_LENGTH = 4_000;

export function isChannel(value: unknown): value is Channel {
  return typeof value === 'string' && CHANNELS.has(value as Channel);
}

/**
 * Accept both legacy string context entries and message-shaped entries,
 * but expose only bounded text to the reply agent.
 */
export function normalizeCommunicationContext(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, MAX_CONTEXT_MESSAGES).flatMap((item): string[] => {
    const candidate = typeof item === 'string'
      ? item
      : item && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>).text
        : undefined;

    if (typeof candidate !== 'string') return [];
    const text = candidate.trim().slice(0, MAX_CONTEXT_TEXT_LENGTH);
    return text ? [text] : [];
  });
}
