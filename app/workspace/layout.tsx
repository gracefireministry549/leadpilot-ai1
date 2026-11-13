export const dynamic = 'force-dynamic';

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../src/auth/supabase-server';
import WorkspaceShell from '../../components/workspace-shell';
import { displayNameFrom } from '../../src/workspace/dashboard-data';
import './workspace-shell.css';
import './dashboard.css';

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('company_memberships')
    .select('company_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  let companyName = 'New company workspace';
  let pendingApprovals = 0;

  if (membership?.company_id) {
    const [{ data: company }, { count }] = await Promise.all([
      supabase.from('companies').select('name').eq('id', membership.company_id).maybeSingle(),
      supabase.from('approval_requests').select('id', { count: 'exact', head: true }).eq('company_id', membership.company_id).eq('status', 'pending'),
    ]);
    if (company?.name) companyName = company.name;
    pendingApprovals = count ?? 0;
  }

  const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();

  return (
    <WorkspaceShell
      companyName={companyName}
      userEmail={user.email || 'Owner account'}
      displayName={displayNameFrom(profile?.display_name, user.email)}
      pendingApprovals={pendingApprovals}
    >
      {children}
    </WorkspaceShell>
  );
}
