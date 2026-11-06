export const dynamic = 'force-dynamic';

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '../../src/auth/supabase-server';
import WorkspaceShell from '../../components/workspace-shell';
import './workspace-shell.css';

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

  if (membership?.company_id) {
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', membership.company_id)
      .maybeSingle();

    if (company?.name) companyName = company.name;
  }

  return (
    <WorkspaceShell companyName={companyName} userEmail={user.email || 'Owner account'}>
      {children}
    </WorkspaceShell>
  );
}
