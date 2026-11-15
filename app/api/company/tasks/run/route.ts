import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../../src/auth/supabase-server';
import { runAgentWithBrain } from '../../../../../src/agents/brain';
import { rateLimit } from '../../../../../src/cache/redis';
import { getActiveCompanyMembership } from '../../../../../src/auth/company-membership';

const MAX_BODY_BYTES = 16_384;

const mapping: Record<string, string> = {
  company_manager: 'general-manager',
  opportunity_researcher: 'opportunity-finder',
  lead_researcher: 'lead-finder',
  website_builder: 'website-brand',
  sales_analyst: 'general-manager',
  finance_assistant: 'general-manager',
};
const RUNNER_ROLES = ['owner', 'admin', 'member'];

type Employee = { id: string; role_key: string; display_name: string; status: string };

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
  let parsed: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return NextResponse.json({ error: 'Request body is too large.' }, { status: 413 });
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return NextResponse.json({ error: 'A valid JSON request body is required.' }, { status: 400 });
  }
  const body = parsed as Record<string, unknown>;
  const taskId = typeof body.taskId === 'string' ? body.taskId.trim().slice(0, 120) : '';
  let title = typeof body.title === 'string' ? body.title.trim() : '';
  let instructions = typeof body.instructions === 'string' ? body.instructions.trim().slice(0, 8_000) : '';
  const employeeRole = typeof body.employeeRole === 'string' ? body.employeeRole.slice(0, 80) : '';

  const requestedCompanyId = typeof body.companyId === 'string' ? body.companyId.trim() : undefined;
  const { data: membership, error: membershipError } = await getActiveCompanyMembership(supabase, user.id, requestedCompanyId);
  if (membershipError) return NextResponse.json({ error: 'Could not verify company access.' }, { status: 503 });
  if (!membership) return NextResponse.json({ error: 'Company membership required.' }, { status: 403 });
  if (!RUNNER_ROLES.includes(membership.role)) return NextResponse.json({ error: 'Your role is read-only and cannot run tasks.' }, { status: 403 });
  const companyId = membership.company_id as string;
  const configuredLimit = Number(process.env.AGENT_RATE_LIMIT_PER_HOUR || 30);
  const limit = Number.isFinite(configuredLimit) ? Math.max(1, Math.min(500, Math.floor(configuredLimit))) : 30;
  const rate = await rateLimit('rate:company-task:' + companyId + ':' + user.id, limit, 3600);
  if (!rate.allowed) return NextResponse.json({ error: 'You have reached the hourly task execution limit.' }, { status: 429 });

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
    const outcome = await runAgentWithBrain({
      supabase,
      userId: user.id,
      companyId,
      employeeRole: employee?.role_key ?? 'company_manager',
      agent: agent as never,
      title,
      instructions,
    });
    if (!outcome.ok) {
      await markFailed(outcome.error);
      return NextResponse.json({ error: outcome.error, taskId: activeTaskId }, { status: outcome.status });
    }

    const payload = outcome.payload;
    const data = payload as { message?: unknown; results?: unknown; evidence?: unknown };

    const { error: updateError } = await supabase.from('company_tasks').update({ status: 'succeeded', result: payload, completed_at: new Date().toISOString() }).eq('id', activeTaskId).eq('company_id', companyId);
    if (updateError) return NextResponse.json({ error: 'The task ran but its result could not be saved.', taskId: activeTaskId }, { status: 500 });

    const { error: reportError } = await supabase.from('research_reports').insert({
      company_id: companyId,
      created_by: user.id,
      agent_key: agent,
      title,
      summary: typeof data.message === 'string' ? data.message : 'Agent task completed. Review the structured findings and source evidence.',
      findings: Array.isArray(data.results) ? data.results : [],
      evidence: Array.isArray(data.evidence) ? data.evidence : (((payload.brief as { picks?: unknown } | undefined)?.picks as unknown[]) ?? []),
      confidence: null,
    });

    return NextResponse.json({ taskId: activeTaskId, agent, result: payload, reportSaved: !reportError, cached: outcome.cached }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent execution failed.';
    await markFailed(message);
    return NextResponse.json({ error: message, taskId: activeTaskId }, { status: 500 });
  }
}
