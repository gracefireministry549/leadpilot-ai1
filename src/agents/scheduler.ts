import { createClient } from '@supabase/supabase-js';
import { runAgent } from './runtime';
import type { AgentName } from '../../docs/agent-contract';

export type ScheduleFrequency = 'hourly' | 'daily' | 'weekly';

export interface AgentSchedule {
  id: string; userId: string; agentId: string; query: string; location?: string; industry?: string;
  limitCount: number; frequency: ScheduleFrequency; active: boolean; nextRunAt: string;
  lastRunAt?: string; lastStatus?: string; lastResultCount: number;
}

export function nextRun(from: Date, frequency: ScheduleFrequency): Date {
  const next = new Date(from);
  if (frequency === 'hourly') next.setHours(next.getHours() + 1);
  else if (frequency === 'daily') next.setDate(next.getDate() + 1);
  else next.setDate(next.getDate() + 7);
  return next;
}

export function isDue(schedule: Pick<AgentSchedule, 'active' | 'nextRunAt'>, now = new Date()): boolean {
  return schedule.active && new Date(schedule.nextRunAt).getTime() <= now.getTime();
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server credentials are not configured.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function runDueAgentSchedules(limit = 10) {
  const supabase = adminClient();
  const now = new Date();
  const { data, error } = await supabase.from('agent_schedules').select('*').eq('active', true).lte('next_run_at', now.toISOString()).order('next_run_at', { ascending: true }).limit(limit);
  if (error) throw error;
  const runs: Array<{ id: string; status: 'completed' | 'failed'; resultCount: number }> = [];

  for (const schedule of data ?? []) {
    let status: 'completed' | 'failed' = 'completed';
    let resultCount = 0;
    try {
      // Resolve the owner's company so leads persist under the company (a
      // user id in businesses.company_id would violate the FK constraint).
      const { data: membership } = await supabase
        .from('company_memberships')
        .select('company_id')
        .eq('user_id', schedule.user_id)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      const auth = membership?.company_id
        ? { accountId: membership.company_id as string, userId: schedule.user_id }
        : { accountId: schedule.user_id as string };

      const result = await runAgent(auth, {
        agent: schedule.agent_id as AgentName, query: schedule.query, location: schedule.location ?? undefined,
        industry: schedule.industry ?? undefined, limit: schedule.limit_count,
      });

      const body = 'body' in result && result.body && typeof result.body === 'object'
        ? result.body as { results?: unknown[] }
        : { results: [] };
      resultCount = Array.isArray(body.results) ? body.results.length : 0;
      const responseStatus = 'status' in result && typeof result.status === 'number' ? result.status : 500;
      status = responseStatus >= 200 && responseStatus < 300 ? 'completed' : 'failed';
    } catch {
      // A throwing agent used to abort the whole batch and leave the failing
      // schedule due forever, starving every other schedule.
      status = 'failed';
    }
    // Always advance next_run_at, even after a failure, so one bad schedule
    // cannot retry every tick and block the rest.
    await supabase.from('agent_schedules').update({
      next_run_at: nextRun(now, schedule.frequency as ScheduleFrequency).toISOString(),
      last_run_at: now.toISOString(), last_status: status, last_result_count: resultCount,
    }).eq('id', schedule.id);
    runs.push({ id: schedule.id, status, resultCount });
  }
  return runs;
}
