import test from 'node:test';
import assert from 'node:assert/strict';
import { isWorkspaceNavActive, workspaceNavigation } from '../src/workspace/navigation';

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
    '/workspace/research',
    '/workspace/reports',
    '/workspace/approvals',
    '/workspace/crm',
    '/workspace/finance',
    '/settings/account',
  ]);
});
