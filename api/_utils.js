const { createClient } = require("@supabase/supabase-js");

// Lazy initialization of Supabase client
let _supabase = null;
function getSupabase() {
  if (!_supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    _supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabase;
}

// Helper function to get user's profile key
async function getUserProfileKey(userId) {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('ayr_profile_key')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data?.ayr_profile_key || null;
  } catch (error) {
    console.error('Error fetching user profile key:', error);
    return null;
  }
}

// Helper function to get workspace's profile key directly by workspace ID
async function getWorkspaceProfileKey(workspaceId) {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('workspaces')
      .select('ayr_profile_key')
      .eq('id', workspaceId)
      .single();

    if (error) throw error;
    return data?.ayr_profile_key || null;
  } catch (error) {
    console.error('Error fetching workspace profile key:', error);
    return null;
  }
}

// Helper function to get workspace's profile key for a user (handles team inheritance)
async function getWorkspaceProfileKeyForUser(userId) {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    // First, check if user is a member of any workspace
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', userId)
      .single();

    if (membershipError && membershipError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error checking workspace membership:', membershipError);
      return null;
    }

    if (membership) {
      // User is a workspace member, get the workspace's profile key
      const workspaceProfileKey = await getWorkspaceProfileKey(membership.workspace_id);
      if (workspaceProfileKey) {
        return workspaceProfileKey;
      }
    }

    // User is not a workspace member or workspace has no profile key
    // Fall back to user's own profile key
    return await getUserProfileKey(userId);
  } catch (error) {
    console.error('Error fetching workspace profile key for user:', error);
    return null;
  }
}

// CORS headers helper
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
}

// Parse JSON body helper
function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body) {
      resolve(req.body);
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

module.exports = {
  getSupabase,
  getUserProfileKey,
  getWorkspaceProfileKey,
  getWorkspaceProfileKeyForUser,
  setCors,
  parseBody
};
