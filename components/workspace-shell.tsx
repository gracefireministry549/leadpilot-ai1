'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { isWorkspaceNavActive, workspaceNavigation } from '../src/workspace/navigation';
import WorkspaceSearch from './workspace-search';

type Props = {
  children: ReactNode;
  companyName: string;
  userEmail: string;
  displayName?: string;
  pendingApprovals?: number;
};

const mobileHrefs = ['/workspace', '/workspace/agents', '/workspace/leads', '/workspace/approvals'];

export default function WorkspaceShell({ children, companyName, userEmail, displayName, pendingApprovals = 0 }: Props) {
  const pathname = usePathname() || '/workspace';
  const [menuOpen, setMenuOpen] = useState(false);
  const activeItem = workspaceNavigation.find((item) => isWorkspaceNavActive(pathname, item.href));
  const hasName = Boolean(displayName && displayName !== 'there');
  const initials = ((hasName ? displayName : userEmail.split('@')[0]) || 'Owner').slice(0, 2).toUpperCase();
  const approvalLabel = pendingApprovals > 99 ? '99+' : String(pendingApprovals);

  function renderNavigation(section: 'WORKSPACE' | 'MANAGEMENT') {
    return workspaceNavigation
      .filter((item) => item.section === section)
      .map((item) => {
        const active = isWorkspaceNavActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? 'workspace-nav-link active' : 'workspace-nav-link'}
            aria-current={active ? 'page' : undefined}
            onClick={() => setMenuOpen(false)}
          >
            <span className="workspace-nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
            {item.href === '/workspace/approvals' && pendingApprovals > 0 ? (
              <span className="workspace-nav-count" aria-label={`${pendingApprovals} pending approvals`}>{approvalLabel}</span>
            ) : null}
          </Link>
        );
      });
  }

  return (
    <div className="workspace-frame">
      {menuOpen ? (
        <button
          className="workspace-backdrop"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <aside className={menuOpen ? 'workspace-sidebar is-open' : 'workspace-sidebar'}>
        <Link className="workspace-brand" href="/workspace" onClick={() => setMenuOpen(false)}>
          <span className="workspace-brand-mark">LP</span>
          <span>LeadPilot<span> AI</span></span>
        </Link>

        <div className="workspace-company-card">
          <span className="workspace-overline">YOUR COMPANY</span>
          <strong>{companyName}</strong>
          <span className="workspace-company-role">Owner workspace</span>
        </div>

        <nav className="workspace-navigation" aria-label="Company navigation">
          <p className="workspace-nav-heading">WORKSPACE</p>
          {renderNavigation('WORKSPACE')}
          <p className="workspace-nav-heading management-heading">MANAGEMENT</p>
          {renderNavigation('MANAGEMENT')}
        </nav>

        <div className="workspace-sidebar-footer">
          <div className="workspace-user-avatar">{initials}</div>
          <div className="workspace-user-copy">
            <strong>{hasName ? displayName : 'Company owner'}</strong>
            <span>{userEmail}</span>
          </div>
          <Link href="/settings/account" aria-label="Account settings" onClick={() => setMenuOpen(false)}>⚙</Link>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-topbar-left">
            <button
              className="workspace-menu-button"
              type="button"
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>
            <div className="workspace-breadcrumb">
              <span>COMPANY WORKSPACE</span>
              <strong>{activeItem?.label || 'Dashboard'}</strong>
            </div>
          </div>
          <WorkspaceSearch />
          <div className="workspace-topbar-right">
            <Link href="/workspace/approvals" className="workspace-bell" aria-label={pendingApprovals > 0 ? `${pendingApprovals} pending approvals` : 'No pending approvals'}>
              <span aria-hidden="true">🔔</span>
              {pendingApprovals > 0 ? <b>{approvalLabel}</b> : null}
            </Link>
            <Link href="/settings/account" className="workspace-topbar-account">
              <span className="workspace-topbar-avatar">{initials}</span>
              <span>Account</span>
            </Link>
          </div>
        </header>

        <div className="workspace-content">{children}</div>
      </div>

      <nav className="workspace-mobile-nav" aria-label="Quick navigation">
        {workspaceNavigation.filter((item) => mobileHrefs.includes(item.href)).map((item) => {
          const active = isWorkspaceNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? 'workspace-mobile-link active' : 'workspace-mobile-link'}
              aria-current={active ? 'page' : undefined}
            >
              <span aria-hidden="true">{item.icon}</span>
              <small>{item.shortLabel}</small>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
