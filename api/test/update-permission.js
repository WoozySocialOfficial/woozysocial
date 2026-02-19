const { getSupabase, sendSuccess, sendError, setCors } = require("../_utils");

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return sendError(res, "Method not allowed", 405);
  }

  const supabase = getSupabase();
  const { workspaceId, userId, canFinalApproval } = req.body;

  console.log('🧪 TEST ENDPOINT - UPDATE PERMISSION');
  console.log('  workspaceId:', workspaceId);
  console.log('  userId:', userId);
  console.log('  canFinalApproval:', canFinalApproval);
  console.log('  typeof canFinalApproval:', typeof canFinalApproval);

  // Direct update - no complex logic
  const { data, error } = await supabase
    .from('workspace_members')
    .update({ can_final_approval: canFinalApproval })
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .select();

  console.log('  Result data:', data);
  console.log('  Result error:', error);

  if (error) {
    return sendError(res, error.message, 500);
  }

  return sendSuccess(res, {
    updated: data?.length > 0,
    data: data,
    message: data?.length > 0
      ? `Successfully updated can_final_approval to ${canFinalApproval}`
      : 'No rows were updated'
  });
};
