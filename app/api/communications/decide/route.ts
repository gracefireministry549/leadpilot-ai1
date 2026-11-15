import { NextRequest, NextResponse } from 'next/server';
import { decideClientReply } from '../../../../src/communications/agent';
import type { CommunicationMessage } from '../../../../src/communications/types';
import { createSupabaseServerClient, getSupabaseAuthenticatedUser } from '../../../../src/auth/supabase-server';
import { rateLimit } from '../../../../src/cache/redis';

const MAX_BODY_BYTES = 16_384;
const MAX_TEXT_LENGTH = 4_000;
const MAX_CONTEXT_MESSAGES = 20;

export async function POST(request: NextRequest) {
  const user = await getSupabaseAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });

  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
    }
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  if (text.length > MAX_TEXT_LENGTH) return NextResponse.json({ error: 'text must be no longer than 4,000 characters.' }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: membership, error: membershipError } = await supabase
    .from('company_memberships').select('company_id').eq('user_id', user.id)
    .eq('status', 'active').limit(1).maybeSingle();
  if (membershipError) return NextResponse.json({ error: 'Could not verify company access.' }, { status: 503 });
  if (!membership) return NextResponse.json({ error: 'Company membership required.' }, { status: 403 });

  const configuredLimit = Number(process.env.AGENT_RATE_LIMIT_PER_HOUR || 30);
  const limit = Number.isFinite(configuredLimit) ? Math.max(1, Math.min(500, Math.floor(configuredLimit))) : 30;
  const rate = await rateLimit('rate:communications-decide:' + membership.company_id + ':' + user.id, limit, 3600);
  if (!rate.allowed) return NextResponse.json({ error: 'You have reached the hourly communication analysis limit.' }, { status: 429 });

  const message: CommunicationMessage = {
    id: typeof input.id === 'string' ? input.id.slice(0, 100) : crypto.randomUUID(),
    channel: typeof input.channel === 'string' ? input.channel.slice(0, 40) : 'web',
    conversationId: typeof input.conversationId === 'string' ? input.conversationId.slice(0, 120) : 'default',
    direction: 'inbound',
    text,
    createdAt: new Date().toISOString(),
  };
  const context: CommunicationMessage[] = Array.isArray(input.context)
    ? input.context.slice(0, MAX_CONTEXT_MESSAGES).flatMap((item): CommunicationMessage[] => {
        if (!item || typeof item !== 'object') return [];
        const entry = item as Record<string, unknown>;
        if (typeof entry.text !== 'string' || !entry.text.trim()) return [];
        const channel = entry.channel === 'telegram' || entry.channel === 'whatsapp' ? entry.channel : 'web';
        const direction = entry.direction === 'outbound' ? 'outbound' : 'inbound';
        return [{
          id: typeof entry.id === 'string' ? entry.id.slice(0, 100) : crypto.randomUUID(),
          channel,
          conversationId: typeof entry.conversationId === 'string' ? entry.conversationId.slice(0, 120) : message.conversationId,
          direction,
          text: entry.text.trim().slice(0, MAX_TEXT_LENGTH),
          createdAt: typeof entry.createdAt === 'string' ? entry.createdAt.slice(0, 40) : new Date().toISOString(),
          requiresApproval: entry.requiresApproval === true,
        }];
      })
    : [];
  return NextResponse.json(decideClientReply(message, context));
}
