import assert from 'node:assert/strict';
import test from 'node:test';
import { claimApprovedOutreach, completeApprovedOutreach, type ApprovalExecutionRpcClient } from './approval-execution';

test('claim uses the approval, company and authenticated actor identifiers', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client: ApprovalExecutionRpcClient = {
    async rpc(name, args) { calls.push({ name, args }); return { data: true, error: null }; },
  };
  assert.equal(await claimApprovedOutreach(client, 'approval-1', 'company-1', 'actor-1', { leadId: 'lead-1', recipient: 'lead@example.com', subject: 'Approved subject', text: 'Approved copy' }), true);
  assert.deepEqual(calls, [{
    name: 'claim_approved_outreach',
    args: { target_approval_id: 'approval-1', target_company_id: 'company-1', target_actor_id: 'actor-1', target_lead_id: 'lead-1', target_recipient: 'lead@example.com', target_subject: 'Approved subject', target_message: 'Approved copy' },
  }]);
});

test('claim reports a concurrent or previously consumed approval', async () => {
  const client: ApprovalExecutionRpcClient = { async rpc() { return { data: false, error: null }; } };
  assert.equal(await claimApprovedOutreach(client, 'approval-1', 'company-1', 'actor-1', { leadId: 'lead-1', recipient: 'lead@example.com', subject: 'Approved subject', text: 'Approved copy' }), false);
});

test('failed provider delivery releases the claim for retry', async () => {
  let captured: Record<string, unknown> | undefined;
  const client: ApprovalExecutionRpcClient = {
    async rpc(name, args) {
      captured = { name, ...args };
      return { data: true, error: null };
    },
  };
  assert.equal(await completeApprovedOutreach(client, 'approval-1', 'company-1', 'actor-1', false), true);
  assert.deepEqual(captured, {
    name: 'complete_approved_outreach',
    target_approval_id: 'approval-1',
    target_company_id: 'company-1',
    target_actor_id: 'actor-1',
    target_succeeded: false,
  });
});

test('RPC failures fail closed', async () => {
  const client: ApprovalExecutionRpcClient = { async rpc() { return { data: null, error: new Error('db down') }; } };
  await assert.rejects(() => claimApprovedOutreach(client, 'approval-1', 'company-1', 'actor-1', { leadId: 'lead-1', recipient: 'lead@example.com', subject: 'Approved subject', text: 'Approved copy' }));
});
