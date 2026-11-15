export type ApprovalExecutionRpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
};

export async function claimApprovedOutreach(
  client: ApprovalExecutionRpcClient,
  approvalId: string,
  companyId: string,
  actorId: string,
  approvedMessage: { leadId: string; recipient: string; subject: string; text: string },
): Promise<boolean> {
  const { data, error } = await client.rpc('claim_approved_outreach', {
    target_approval_id: approvalId,
    target_company_id: companyId,
    target_actor_id: actorId,
    target_lead_id: approvedMessage.leadId,
    target_recipient: approvedMessage.recipient,
    target_subject: approvedMessage.subject,
    target_message: approvedMessage.text,
  });
  if (error) throw new Error('Could not claim the approved outreach request.');
  return data === true;
}

export async function completeApprovedOutreach(client: ApprovalExecutionRpcClient, approvalId: string, companyId: string, actorId: string, succeeded: boolean): Promise<boolean> {
  const { data, error } = await client.rpc('complete_approved_outreach', {
    target_approval_id: approvalId, target_company_id: companyId, target_actor_id: actorId, target_succeeded: succeeded,
  });
  if (error) throw new Error('Could not update the outreach execution state.');
  return data === true;
}
