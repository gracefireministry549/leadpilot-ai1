export type ApprovalExecutionRpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
};

export async function claimApprovedOutreach(
  client: ApprovalExecutionRpcClient,
  approvalId: string,
  companyId: string,
  actorId: string,
): Promise<boolean> {
  const { data, error } = await client.rpc('claim_approved_outreach', {
    target_approval_id: approvalId,
    target_company_id: companyId,
    target_actor_id: actorId,
  });
  if (error) throw new Error('Could not claim the approved outreach request.');
  return data === true;
}

export async function completeApprovedOutreach(
  client: ApprovalExecutionRpcClient,
  approvalId: string,
  companyId: string,
  actorId: string,
  succeeded: boolean,
): Promise<boolean> {
  const { data, error } = await client.rpc('complete_approved_outreach', {
    target_approval_id: approvalId,
    target_company_id: companyId,
    target_actor_id: actorId,
    target_succeeded: succeeded,
  });
  if (error) throw new Error('Could not update the outreach execution state.');
  return data === true;
}
