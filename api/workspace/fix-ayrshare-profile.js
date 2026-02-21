/**
 * Manual endpoint to fix workspaces that are missing Ayrshare profiles
 * This happens when payment succeeded but Ayrshare profile creation failed
 *
 * POST /api/workspace/fix-ayrshare-profile
 * Body: { workspaceId: "uuid" }
 *
 * Requires admin authentication
 */

const { getSupabase, logError } = require('../_utils');
const axios = require('axios');

// Create Ayrshare profile for a workspace
async function createAyrshareProfile(workspaceName) {
  try {
    console.log('[FIX-AYRSHARE] Creating Ayrshare profile for:', workspaceName);

    const response = await axios.post(
      'https://api.ayrshare.com/api/profiles/profile',
      {
        title: workspaceName || 'My Business',
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    if (response.data && response.data.profileKey) {
      console.log('[FIX-AYRSHARE] Profile created successfully:', {
        profileKey: response.data.profileKey,
        refId: response.data.refId
      });
      return {
        profileKey: response.data.profileKey,
        refId: response.data.refId || null,
      };
    }

    console.error('[FIX-AYRSHARE] No profileKey in Ayrshare response:', response.data);
    return null;
  } catch (error) {
    console.error('[FIX-AYRSHARE] Ayrshare API error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    logError('fix-ayrshare-profile', error);
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({
        error: 'Missing workspaceId',
        message: 'Please provide a workspaceId in the request body'
      });
    }

    console.log('[FIX-AYRSHARE] Fixing workspace:', workspaceId);

    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
    }

    // 1. Get the workspace details
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id, name, ayr_profile_key, ayr_ref_id, subscription_tier, subscription_status')
      .eq('id', workspaceId)
      .single();

    if (workspaceError || !workspace) {
      console.error('[FIX-AYRSHARE] Workspace not found:', workspaceError);
      return res.status(404).json({
        error: 'Workspace not found',
        workspaceId
      });
    }

    console.log('[FIX-AYRSHARE] Workspace found:', {
      id: workspace.id,
      name: workspace.name,
      hasProfileKey: !!workspace.ayr_profile_key,
      tier: workspace.subscription_tier,
      status: workspace.subscription_status
    });

    // 2. Check if workspace already has a profile key
    // But skip if it's the env var fallback (wrong key saved due to timeout on creation)
    const fallbackKey = process.env.AYRSHARE_PROFILE_KEY;
    if (workspace.ayr_profile_key && workspace.ayr_profile_key !== fallbackKey) {
      // Has a real profile key - only skip if refId is also present
      if (workspace.ayr_ref_id) {
        return res.status(200).json({
          success: true,
          message: 'Workspace already has Ayrshare profile',
          workspace: {
            id: workspace.id,
            name: workspace.name,
            profileKey: workspace.ayr_profile_key,
            refId: workspace.ayr_ref_id
          }
        });
      }
      // Has profileKey but missing refId - fall through to fetch it
      console.log('[FIX-AYRSHARE] Workspace has profileKey but missing refId, will fetch it...');
    } else if (workspace.ayr_profile_key === fallbackKey) {
      console.log('[FIX-AYRSHARE] Workspace has env var fallback key (wrong key) - will recreate profile');
    }

    // 3. Check if workspace has an active subscription
    if (workspace.subscription_status !== 'active') {
      return res.status(400).json({
        error: 'Workspace subscription not active',
        message: 'Only active workspaces can have Ayrshare profiles created',
        workspace: {
          id: workspace.id,
          status: workspace.subscription_status
        }
      });
    }

    // 4a. If workspace has correct profileKey but missing refId, just fetch refId
    if (workspace.ayr_profile_key && workspace.ayr_profile_key !== fallbackKey && !workspace.ayr_ref_id) {
      console.log('[FIX-AYRSHARE] Fetching refId from Ayrshare profiles list...');
      try {
        const profilesRes = await axios.get(
          'https://api.ayrshare.com/api/profiles',
          {
            headers: { Authorization: `Bearer ${process.env.AYRSHARE_API_KEY}` },
            timeout: 10000
          }
        );
        const profiles = profilesRes.data.profiles || [];
        const match = profiles.find(p => p.profileKey === workspace.ayr_profile_key);
        if (match?.refId) {
          await supabase.from('workspaces').update({
            ayr_ref_id: match.refId,
            updated_at: new Date().toISOString()
          }).eq('id', workspaceId);
          return res.status(200).json({
            success: true,
            message: 'Fetched and saved missing refId',
            workspace: { id: workspace.id, name: workspace.name, profileKey: workspace.ayr_profile_key, refId: match.refId }
          });
        }
      } catch (fetchErr) {
        console.error('[FIX-AYRSHARE] Could not fetch profiles list:', fetchErr.message);
      }
    }

    // 4. Create the Ayrshare profile
    console.log('[FIX-AYRSHARE] Creating Ayrshare profile...');
    const ayrshareProfile = await createAyrshareProfile(workspace.name);

    if (!ayrshareProfile) {
      return res.status(500).json({
        error: 'Failed to create Ayrshare profile',
        message: 'Ayrshare API call failed. Check server logs for details.',
        workspace: {
          id: workspace.id,
          name: workspace.name
        }
      });
    }

    // 5. Update the workspace with the new profile key and ref ID
    console.log('[FIX-AYRSHARE] Updating workspace with profile key...');
    const { data: updatedWorkspace, error: updateError } = await supabase
      .from('workspaces')
      .update({
        ayr_profile_key: ayrshareProfile.profileKey,
        ayr_ref_id: ayrshareProfile.refId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', workspaceId)
      .select()
      .single();

    if (updateError) {
      console.error('[FIX-AYRSHARE] Failed to update workspace:', updateError);
      return res.status(500).json({
        error: 'Failed to update workspace',
        message: updateError.message,
        profileCreated: true,
        profileKey: ayrshareProfile.profileKey,
        note: 'Ayrshare profile was created but database update failed. Contact support with this profileKey.'
      });
    }

    console.log('[FIX-AYRSHARE] Success! Workspace updated with Ayrshare profile');

    return res.status(200).json({
      success: true,
      message: 'Ayrshare profile created and workspace updated successfully',
      workspace: {
        id: updatedWorkspace.id,
        name: updatedWorkspace.name,
        profileKey: updatedWorkspace.ayr_profile_key,
        refId: updatedWorkspace.ayr_ref_id,
        tier: updatedWorkspace.subscription_tier,
        status: updatedWorkspace.subscription_status
      }
    });

  } catch (error) {
    console.error('[FIX-AYRSHARE] Unexpected error:', error);
    logError('fix-ayrshare-profile-handler', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
};
