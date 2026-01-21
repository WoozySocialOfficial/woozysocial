/**
 * Find workspaces with active subscriptions but missing Ayrshare profiles
 * GET /api/workspace/check-missing-profiles
 *
 * Use this to identify workspaces that need the fix-ayrshare-profile endpoint
 */

const { getSupabase, logError } = require('../_utils');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    console.log('[CHECK-PROFILES] Finding workspaces with missing Ayrshare profiles');

    // Find workspaces with active subscriptions but no profile key
    const { data: workspaces, error } = await supabase
      .from('workspaces')
      .select(`
        id,
        name,
        slug,
        subscription_status,
        subscription_tier,
        ayr_profile_key,
        created_at,
        owner_id
      `)
      .is('ayr_profile_key', null)
      .in('subscription_status', ['active', 'trialing'])
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[CHECK-PROFILES] Query error:', error);
      logError('check-missing-profiles', error);
      return res.status(500).json({ error: 'Failed to query workspaces', details: error.message });
    }

    // Get owner details for each workspace
    const ownerIds = [...new Set(workspaces.map(w => w.owner_id).filter(Boolean))];
    let owners = {};

    if (ownerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('id, email, full_name')
        .in('id', ownerIds);

      if (profiles) {
        owners = profiles.reduce((acc, p) => {
          acc[p.id] = { email: p.email, name: p.full_name };
          return acc;
        }, {});
      }
    }

    const affectedWorkspaces = workspaces.map(w => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      status: w.subscription_status,
      tier: w.subscription_tier,
      createdAt: w.created_at,
      owner: owners[w.owner_id] || { id: w.owner_id }
    }));

    console.log(`[CHECK-PROFILES] Found ${affectedWorkspaces.length} workspaces with missing profiles`);

    return res.status(200).json({
      success: true,
      count: affectedWorkspaces.length,
      workspaces: affectedWorkspaces,
      message: affectedWorkspaces.length > 0
        ? `Found ${affectedWorkspaces.length} workspace(s) with active subscriptions but missing Ayrshare profiles. Use POST /api/workspace/fix-ayrshare-profile with { workspaceId } to fix each one.`
        : 'All workspaces with active subscriptions have Ayrshare profiles'
    });

  } catch (error) {
    console.error('[CHECK-PROFILES] Unexpected error:', error);
    logError('check-missing-profiles-handler', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};
