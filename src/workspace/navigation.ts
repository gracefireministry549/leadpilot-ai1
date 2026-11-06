export type WorkspaceNavigationItem = {
  label: string;
  href: string;
  icon: string;
  section: 'WORKSPACE' | 'MANAGEMENT';
};

export const workspaceNavigation: WorkspaceNavigationItem[] = [
  { label: 'Company overview', href: '/workspace', icon: '⌂', section: 'WORKSPACE' },
  { label: 'AI employees', href: '/workspace/agents', icon: '✦', section: 'WORKSPACE' },
  { label: 'Opportunity research', href: '/workspace/research', icon: '⌕', section: 'WORKSPACE' },
  { label: 'Research reports', href: '/workspace/reports', icon: '▤', section: 'WORKSPACE' },
  { label: 'Approval center', href: '/workspace/approvals', icon: '✓', section: 'WORKSPACE' },
  { label: 'Customers & CRM', href: '/workspace/crm', icon: '♙', section: 'WORKSPACE' },
  { label: 'Revenue & finance', href: '/workspace/finance', icon: '↗', section: 'MANAGEMENT' },
  { label: 'Account settings', href: '/settings/account', icon: '⚙', section: 'MANAGEMENT' },
];

export function isWorkspaceNavActive(pathname: string, href: string): boolean {
  if (href === '/workspace') return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}
