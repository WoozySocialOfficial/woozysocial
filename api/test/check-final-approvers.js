const { getSupabase, sendSuccess, sendError, setCors } = require("../_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return sendError(res, "Method not allowed", 405);
  }

  const supabase = getSupabase();
  const { workspaceId } = req.query;

  console.log('🧪 TEST: Check final approvers for workspace', workspaceId);

  if (!workspaceId) {
    return sendError(res, "workspaceId is required", 400);
  }

  // Query 1: All members
  const { data: allMembers, error: allError } = await supabase
    .from('workspace_members')
    .select('user_id, role, can_final_approval')
    .eq('workspace_id', workspaceId);

  // Query 2: Only final approvers
  const { data: finalApprovers, error: approverError } = await supabase
    .from('workspace_members')
    .select('user_id, role, can_final_approval')
    .eq('workspace_id', workspaceId)
    .eq('can_final_approval', true);

  const hasFinalApprovers = finalApprovers && finalApprovers.length > 0;
  const suggestedStatus = hasFinalApprovers ? 'pending_internal' : 'pending';

  console.log('🧪 Results:', {
    allMembersCount: allMembers?.length || 0,
    finalApproversCount: finalApprovers?.length || 0,
    hasFinalApprovers,
    suggestedStatus
  });

  return sendSuccess(res, {
    workspaceId,
    allMembers,
    finalApprovers,
    hasFinalApprovers,
    finalApproverCount: finalApprovers?.length || 0,
    suggestedStatus,
    errors: { allError, approverError }
  });
};
