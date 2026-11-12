import test from 'node:test';
import assert from 'node:assert/strict';
import { isWorkspaceNavActive, workspaceNavigation } from '../src/workspace/navigation.ts';

test('overview navigation only matches the overview route', () => {
  assert.equal(isWorkspaceNavActive('/workspace', '/workspace'), true);
  assert.equal(isWorkspaceNavActive('/workspace/agents', '/workspace'), false);
});

test('nested workspace routes keep their parent navigation item active', () => {
  assert.equal(isWorkspaceNavActive('/workspace/agents/history', '/workspace/agents'), true);
  assert.equal(isWorkspaceNavActive('/workspace/agents', '/workspace/approvals'), false);
});

test('workspace navigation exposes the approved company destinations', () => {
  assert.deepEqual(workspaceNavigation.map(({ href }) => href), [
    '/workspace',
    '/workspace/agents',
    '/workspace/leads',
    '/workspace/workpilot',
    '/workspace/research',
    '/workspace/crm',
    '/workspace/approvals',
    '/workspace/finance',
    '/workspace/reports',
    '/settings/account',
  ]);
});

test('every navigation item has a unique href and a short mobile label', () => {
  const hrefs = workspaceNavigation.map(({ href }) => href);
  assert.equal(new Set(hrefs).size, hrefs.length);
  for (const item of workspaceNavigation) assert.ok(item.shortLabel.length > 0 && item.shortLabel.length <= 10);
});
