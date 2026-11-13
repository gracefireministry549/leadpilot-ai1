import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../../src/auth/supabase-server';
import { runAgent } from '../../../../../src/agents/runtime';

const mapping: Record<string, string> = {
  company_manager: 'general-manager',
  opportunity_researcher: 'opportunity-finder',
  lead_researcher: 'lead-finder',
  website_builder: 'website-brand',
  sales_analyst: 'general-manager',
  finance_assistant: 'general-manager',
};
const RUNNER_ROLES = ['owner', 'admin', 'member'];

/** runAgent reports unknown/unsupported agents as a returned status, not a thrown error. */
function agentFailure(result: unknown): string | null {
  const status = typeof (result as { status?: unknown })?.status === 'number' ? (result as { status: number }).status : 200;
  if (status < 400) return null;
  const body = (result as { body?: { error?: unknown } }).body;
  return typeof body?.error === 'string' ? body.error : `The agent could not complete this task (status ${status}).`;
}

type Employee = { id: string; role_key: string; display_name: string; status: string };

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const taskId = typeof body.taskId === 'string' ? body.taskId : '';
  let title = typeof body.title === 'string' ? body.title.trim() : '';
  let instructions = typeof body.instructions === 'string' ? body.instructions.trim() : '';
  const employeeRole = typeof body.employeeRole === 'string' ? body.employeeRole : '';

  const { data: membership } = await supabase.from('company_memberships').select('company_id,role').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Company membership required.' }, { status: 403 });
  if (!RUNNER_ROLES.includes(membership.role)) return NextResponse.json({ error: 'Your role is read-only and cannot run tasks.' }, { status: 403 });
  const companyId = membership.company_id as string;

  let employee: Employee | null = null;
  let activeTaskId = '';

  if (taskId) {
    // Run a task that was queued from the AI Workforce page.
    const { data: queued } = await supabase.from('company_tasks').select('id,title,instructions,employee_id,status').eq('id', taskId).eq('company_id', companyId).maybeSingle();
    if (!queued) return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    if (queued.status !== 'queued') return NextResponse.json({ error: 'Only queued tasks can be run.' }, { status: 409 });
    title = queued.title;
    instructions = queued.instructions ?? '';
    if (queued.employee_id) {
      const { data } = await supabase.from('agent_employees').select('id,role_key,display_name,status').eq('id', queued.employee_id).eq('company_id', companyId).maybeSingle();
      employee = data as Employee | null;
      if (employee && employee.status !== 'active') return NextResponse.json({ error: 'This AI employee is paused.' }, { status: 409 });
    }
    // Claim the task so a double click cannot run it twice.
    const { data: claimed } = await supabase
      .from('company_tasks')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', queued.id)
      .eq('company_id', companyId)
      .eq('status', 'queued')
      .select('id')
      .maybeSingle();
    if (!claimed) return NextResponse.json({ error: 'This task was already started.' }, { status: 409 });
    activeTaskId = claimed.id;
  } else {
    if (title.length < 3 || title.length > 160) return NextResponse.json({ error: 'Task title must be 3–160 characters.' }, { status: 400 });
    if (employeeRole) {
      const { data } = await supabase.from('agent_employees').select('id,role_key,display_name,status').eq('role_key', employeeRole).eq('company_id', companyId).maybeSingle();
      employee = data as Employee | null;
      if (!employee) return NextResponse.json({ error: 'Employee not found in this company.' }, { status: 404 });
      if (employee.status !== 'active') return NextResponse.json({ error: 'This AI employee is paused.' }, { status: 409 });
    }
    const { data: task, error: insertError } = await supabase
      .from('company_tasks')
      .insert({ company_id: companyId, employee_id: employee?.id ?? null, created_by: user.id, title, instructions, status: 'running', started_at: new Date().toISOString() })
      .select('id')
      .single();
    if (insertError || !task) return NextResponse.json({ error: 'Could not create task.' }, { status: 500 });
    activeTaskId = task.id;
  }

  const agent = mapping[employee?.role_key ?? 'company_manager'] ?? 'general-manager';
  const markFailed = (message: string) =>
    supabase.from('company_tasks').update({ status: 'failed', error: message, completed_at: new Date().toISOString() }).eq('id', activeTaskId).eq('company_id', companyId);

  try {
    const result = await runAgent({ accountId: companyId, userId: user.id }, { agent: agent as never, query: instructions ? title + '\n\n' + instructions : title, limit: 20 });
    const failure = agentFailure(result);
    if (failure) {
      await markFailed(failure);
      return NextResponse.json({ error: failure, taskId: activeTaskId }, { status: 502 });
    }

    const payload = result && typeof result === 'object' && 'body' in result ? (result as { body: unknown }).body : result;
    const data = (payload ?? {}) as { message?: unknown; results?: unknown; evidence?: unknown };

    const { error: updateError } = await supabase.from('company_tasks').update({ status: 'succeeded', result: payload, completed_at: new Date().toISOString() }).eq('id', activeTaskId).eq('company_id', companyId);
    if (updateError) return NextResponse.json({ error: 'The task ran but its result could not be saved.', taskId: activeTaskId }, { status: 500 });

    const { error: reportError } = await supabase.from('research_reports').insert({
      company_id: companyId,
      created_by: user.id,
      agent_key: agent,
      title,
      summary: typeof data.message === 'string' ? data.message : 'Agent task completed. Review the structured findings and source evidence.',
      findings: Array.isArray(data.results) ? data.results : [],
      evidence: Array.isArray(data.evidence) ? data.evidence : [],
      confidence: null,
    });

    return NextResponse.json({ taskId: activeTaskId, agent, result: payload, reportSaved: !reportError }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent execution failed.';
    await markFailed(message);
    return NextResponse.json({ error: message, taskId: activeTaskId }, { status: 500 });
  }
}
