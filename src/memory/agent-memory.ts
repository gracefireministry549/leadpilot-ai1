import type { SupabaseClient } from '@supabase/supabase-js';
import { cacheDelete, cacheGet, cacheSet } from '../cache/redis';

export type MemoryKind = 'finding' | 'preference' | 'note' | 'outcome';
export type AgentMemory = { id: string; kind: MemoryKind; content: string; source_url: string | null; importance: number; created_at: string };

const SESSION_WINDOW_MS = 30 * 60 * 1000;
const recallKey = (companyId: string, role: string) => `mem:${companyId}:${role}`;

/** Reuses the user's session for this employee if it was active in the last 30 minutes. */
export async function getOrCreateSession(supabase: SupabaseClient, input: { companyId: string; userId: string; employeeRole: string; title: string }): Promise<string | null> {
  const since = new Date(Date.now() - SESSION_WINDOW_MS).toISOString();
  const { data: existing } = await supabase
    .from('agent_sessions')
    .select('id')
    .eq('company_id', input.companyId)
    .eq('user_id', input.userId)
    .eq('employee_role', input.employeeRole)
    .gte('last_active_at', since)
    .order('last_active_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    await supabase.from('agent_sessions').update({ last_active_at: new Date().toISOString() }).eq('id', existing.id);
    return existing.id as string;
  }
  const { data, error } = await supabase
    .from('agent_sessions')
    .insert({ company_id: input.companyId, user_id: input.userId, employee_role: input.employeeRole, title: input.title.slice(0, 120) })
    .select('id')
    .single();
  return error || !data ? null : (data.id as string);
}

/** Most important, most recent unexpired memories for one AI employee. Hot-cached in Redis for 60 seconds. */
export async function recallMemories(supabase: SupabaseClient, input: { companyId: string; employeeRole: string; limit?: number }): Promise<AgentMemory[]> {
  const key = recallKey(input.companyId, input.employeeRole);
  const hit = await cacheGet(key);
  if (hit) {
    try {
      return JSON.parse(hit) as AgentMemory[];
    } catch {
      /* fall through to the database */
    }
  }
  const { data, error } = await supabase
    .from('agent_memories')
    .select('id,kind,content,source_url,importance,created_at')
    .eq('company_id', input.companyId)
    .eq('employee_role', input.employeeRole)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 8);
  if (error || !data) return [];
  await cacheSet(key, JSON.stringify(data), 60);
  return data as AgentMemory[];
}

export type NewMemory = {
  companyId: string;
  userId: string;
  employeeRole: string;
  sessionId: string | null;
  kind: MemoryKind;
  content: string;
  sourceUrl?: string;
  importance?: number;
  ttlDays?: number;
};

/** A "finding" is a claim about the world, so it must carry a source URL. Returns false if rejected. */
export async function rememberMemory(supabase: SupabaseClient, memory: NewMemory): Promise<boolean> {
  const content = memory.content.trim().slice(0, 600);
  if (content.length < 3) return false;
  if (memory.kind === 'finding' && !memory.sourceUrl) return false;
  const { error } = await supabase.from('agent_memories').insert({
    company_id: memory.companyId,
    user_id: memory.userId,
    session_id: memory.sessionId,
    employee_role: memory.employeeRole,
    kind: memory.kind,
    content,
    source_url: memory.sourceUrl ?? null,
    importance: Math.min(5, Math.max(1, memory.importance ?? 3)),
    expires_at: memory.ttlDays ? new Date(Date.now() + memory.ttlDays * 86400000).toISOString() : null,
  });
  if (error) return false;
  await cacheDelete(recallKey(memory.companyId, memory.employeeRole));
  return true;
}

export function formatMemoryForPrompt(memories: AgentMemory[]): string {
  if (!memories.length) return 'REMEMBERED NOTES: none.';
  return (
    'REMEMBERED NOTES (from earlier work; findings carry the source they came from):\n' +
    memories.map((memory) => `- (${memory.kind}) ${memory.content}${memory.source_url ? ` [source: ${memory.source_url}]` : ''}`).join('\n')
  );
}
