export type WorkspaceNavigationItem = {
  label: string;
  shortLabel: string;
  href: string;
  icon: string;
  section: 'WORKSPACE' | 'MANAGEMENT';
};

export const workspaceNavigation: WorkspaceNavigationItem[] = [
  { label: 'Dashboard', shortLabel: 'Home', href: '/workspace', icon: '⌂', section: 'WORKSPACE' },
  { label: 'AI Workforce', shortLabel: 'Team', href: '/workspace/agents', icon: '✦', section: 'WORKSPACE' },
  { label: 'Lead Intelligence', shortLabel: 'Leads', href: '/workspace/leads', icon: '◎', section: 'WORKSPACE' },
  { label: 'WorkPilot', shortLabel: 'Work', href: '/workspace/workpilot', icon: '✈', section: 'WORKSPACE' },
  { label: 'Research Centre', shortLabel: 'Research', href: '/workspace/research', icon: '⌕', section: 'WORKSPACE' },
  { label: 'CRM', shortLabel: 'CRM', href: '/workspace/crm', icon: '♙', section: 'WORKSPACE' },
  { label: 'Approvals', shortLabel: 'Approvals', href: '/workspace/approvals', icon: '✓', section: 'WORKSPACE' },
  { label: 'Finance', shortLabel: 'Finance', href: '/workspace/finance', icon: '↗', section: 'MANAGEMENT' },
  { label: 'Reports', shortLabel: 'Reports', href: '/workspace/reports', icon: '▤', section: 'MANAGEMENT' },
  { label: 'Settings', shortLabel: 'Settings', href: '/settings/account', icon: '⚙', section: 'MANAGEMENT' },
];

export function isWorkspaceNavActive(pathname: string, href: string): boolean {
  if (href === '/workspace') return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}
