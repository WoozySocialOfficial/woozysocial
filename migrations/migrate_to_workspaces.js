// Data Migration Script: Migrate Existing Users to Workspaces
// This script migrates existing user data to the new workspace system

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../functions/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   - SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nPlease ensure these are set in functions/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Helper function to create a URL-friendly slug from a name
function createSlug(name, userId) {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // Add first 8 chars of user ID to ensure uniqueness
  const userIdShort = userId.substring(0, 8);
  return `${baseSlug}-${userIdShort}`;
}

// Main migration function
async function migrateToWorkspaces() {
  console.log('🚀 Starting workspace migration...\n');

  try {
    // Step 1: Fetch all existing users
    console.log('📋 Step 1: Fetching all users from user_profiles...');
    const { data: users, error: usersError } = await supabase
      .from('user_profiles')
      .select('*');

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    console.log(`✅ Found ${users.length} users to migrate\n`);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Step 2: Migrate each user to a workspace
    for (const user of users) {
      try {
        console.log(`\n👤 Migrating user: ${user.full_name || user.email} (${user.id})`);

        // Check if user already has a workspace
        const { data: existingWorkspace } = await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id)
          .eq('role', 'owner')
          .single();

        if (existingWorkspace) {
          console.log(`⏭️  User already has a workspace, skipping...`);
          successCount++;
          continue;
        }

        // Create workspace name
        const workspaceName = user.full_name
          ? `${user.full_name}'s Workspace`
          : 'Personal Workspace';

        const workspaceSlug = createSlug(workspaceName, user.id);

        console.log(`   📝 Creating workspace: "${workspaceName}" (slug: ${workspaceSlug})`);

        // Create the workspace
        const { data: workspace, error: workspaceError } = await supabase
          .from('workspaces')
          .insert({
            name: workspaceName,
            slug: workspaceSlug,
            ayr_profile_key: user.ayr_profile_key,
            ayr_ref_id: user.ayr_ref_id,
            timezone: user.timezone || 'America/New_York',
            logo_url: user.logo_url,
            notification_preferences: {
              email_notifications: user.email_notifications !== false,
              weekly_summaries: user.weekly_summaries !== false,
              team_activity_alerts: user.team_activity_alerts !== false
            },
            plan_type: 'free',
            max_team_members: 1,
            max_posts_per_month: 50,
            max_social_accounts: 3
          })
          .select()
          .single();

        if (workspaceError) {
          throw new Error(`Failed to create workspace: ${workspaceError.message}`);
        }

        console.log(`   ✅ Workspace created: ${workspace.id}`);

        // Create workspace membership (user as owner)
        console.log(`   👥 Creating workspace membership (role: owner)`);
        const { error: memberError } = await supabase
          .from('workspace_members')
          .insert({
            workspace_id: workspace.id,
            user_id: user.id,
            role: 'owner',
            joined_at: new Date().toISOString(),
            can_manage_team: true,
            can_manage_settings: true,
            can_delete_posts: true
          });

        if (memberError) {
          throw new Error(`Failed to create membership: ${memberError.message}`);
        }

        console.log(`   ✅ Membership created`);

        // Update user's last_workspace_id
        console.log(`   🔄 Updating user's last_workspace_id`);
        const { error: updateUserError } = await supabase
          .from('user_profiles')
          .update({ last_workspace_id: workspace.id })
          .eq('id', user.id);

        if (updateUserError) {
          console.warn(`   ⚠️  Warning: Could not update user's last_workspace_id: ${updateUserError.message}`);
        }

        // Migrate posts to workspace
        console.log(`   📄 Migrating posts to workspace...`);
        const { data: userPosts, error: postsQueryError } = await supabase
          .from('posts')
          .select('id')
          .eq('user_id', user.id)
          .is('workspace_id', null);

        if (!postsQueryError && userPosts && userPosts.length > 0) {
          const { error: postsUpdateError } = await supabase
            .from('posts')
            .update({ workspace_id: workspace.id })
            .eq('user_id', user.id)
            .is('workspace_id', null);

          if (postsUpdateError) {
            console.warn(`   ⚠️  Warning: Could not migrate posts: ${postsUpdateError.message}`);
          } else {
            console.log(`   ✅ Migrated ${userPosts.length} posts`);
          }
        } else {
          console.log(`   ℹ️  No posts to migrate`);
        }

        // Migrate connected_accounts to workspace
        console.log(`   🔗 Migrating connected accounts to workspace...`);
        const { data: userAccounts, error: accountsQueryError } = await supabase
          .from('connected_accounts')
          .select('id')
          .eq('user_id', user.id)
          .is('workspace_id', null);

        if (!accountsQueryError && userAccounts && userAccounts.length > 0) {
          const { error: accountsUpdateError } = await supabase
            .from('connected_accounts')
            .update({ workspace_id: workspace.id })
            .eq('user_id', user.id)
            .is('workspace_id', null);

          if (accountsUpdateError) {
            console.warn(`   ⚠️  Warning: Could not migrate connected accounts: ${accountsUpdateError.message}`);
          } else {
            console.log(`   ✅ Migrated ${userAccounts.length} connected accounts`);
          }
        } else {
          console.log(`   ℹ️  No connected accounts to migrate`);
        }

        // Migrate post_drafts if table exists
        console.log(`   📝 Migrating post drafts to workspace...`);
        const { data: userDrafts, error: draftsQueryError } = await supabase
          .from('post_drafts')
          .select('id')
          .eq('user_id', user.id)
          .is('workspace_id', null);

        if (!draftsQueryError && userDrafts && userDrafts.length > 0) {
          const { error: draftsUpdateError } = await supabase
            .from('post_drafts')
            .update({ workspace_id: workspace.id })
            .eq('user_id', user.id)
            .is('workspace_id', null);

          if (draftsUpdateError) {
            console.warn(`   ⚠️  Warning: Could not migrate post drafts: ${draftsUpdateError.message}`);
          } else {
            console.log(`   ✅ Migrated ${userDrafts.length} post drafts`);
          }
        } else {
          console.log(`   ℹ️  No post drafts to migrate (or table doesn't exist)`);
        }

        // Migrate media_assets if table exists
        console.log(`   🖼️  Migrating media assets to workspace...`);
        const { data: userAssets, error: assetsQueryError } = await supabase
          .from('media_assets')
          .select('id')
          .eq('user_id', user.id)
          .is('workspace_id', null);

        if (!assetsQueryError && userAssets && userAssets.length > 0) {
          const { error: assetsUpdateError } = await supabase
            .from('media_assets')
            .update({ workspace_id: workspace.id })
            .eq('user_id', user.id)
            .is('workspace_id', null);

          if (assetsUpdateError) {
            console.warn(`   ⚠️  Warning: Could not migrate media assets: ${assetsUpdateError.message}`);
          } else {
            console.log(`   ✅ Migrated ${userAssets.length} media assets`);
          }
        } else {
          console.log(`   ℹ️  No media assets to migrate (or table doesn't exist)`);
        }

        console.log(`   🎉 Successfully migrated user ${user.full_name || user.email}`);
        successCount++;

      } catch (error) {
        console.error(`   ❌ Error migrating user ${user.email}:`, error.message);
        errorCount++;
        errors.push({ user: user.email, error: error.message });
      }
    }

    // Step 3: Migrate existing team_members to workspace_members
    console.log(`\n\n📋 Step 3: Migrating existing team_members to workspace_members...`);

    const { data: teamMembers, error: teamMembersError } = await supabase
      .from('team_members')
      .select('*');

    if (teamMembersError) {
      console.warn(`⚠️  Warning: Could not fetch team_members: ${teamMembersError.message}`);
    } else if (teamMembers && teamMembers.length > 0) {
      console.log(`   Found ${teamMembers.length} team member relationships to migrate`);

      for (const tm of teamMembers) {
        try {
          // Find owner's workspace
          const { data: ownerProfile } = await supabase
            .from('user_profiles')
            .select('last_workspace_id')
            .eq('id', tm.owner_id)
            .single();

          if (!ownerProfile || !ownerProfile.last_workspace_id) {
            console.warn(`   ⚠️  Could not find workspace for owner ${tm.owner_id}, skipping...`);
            continue;
          }

          // Check if membership already exists
          const { data: existingMember } = await supabase
            .from('workspace_members')
            .select('id')
            .eq('workspace_id', ownerProfile.last_workspace_id)
            .eq('user_id', tm.member_id)
            .single();

          if (existingMember) {
            console.log(`   ⏭️  Membership already exists for member ${tm.member_id}, skipping...`);
            continue;
          }

          // Add member to owner's workspace
          const { error: addMemberError } = await supabase
            .from('workspace_members')
            .insert({
              workspace_id: ownerProfile.last_workspace_id,
              user_id: tm.member_id,
              role: tm.role === 'admin' ? 'admin' : 'editor',
              invited_by: tm.owner_id,
              invited_at: tm.created_at,
              joined_at: tm.created_at,
              can_manage_team: tm.role === 'admin',
              can_manage_settings: false,
              can_delete_posts: true
            });

          if (addMemberError) {
            console.warn(`   ⚠️  Could not add member ${tm.member_id}: ${addMemberError.message}`);
          } else {
            console.log(`   ✅ Migrated team member ${tm.member_id} to workspace ${ownerProfile.last_workspace_id}`);
          }

        } catch (error) {
          console.warn(`   ⚠️  Error migrating team member:`, error.message);
        }
      }
    } else {
      console.log(`   ℹ️  No team members to migrate`);
    }

    // Summary
    console.log(`\n\n📊 MIGRATION SUMMARY`);
    console.log(`${'='.repeat(50)}`);
    console.log(`✅ Successfully migrated: ${successCount} users`);
    console.log(`❌ Failed to migrate: ${errorCount} users`);
    console.log(`📝 Total users processed: ${users.length}`);

    if (errors.length > 0) {
      console.log(`\n❌ ERRORS:`);
      errors.forEach(err => {
        console.log(`   - ${err.user}: ${err.error}`);
      });
    }

    console.log(`\n🎉 Migration completed!`);
    console.log(`\nNext steps:`);
    console.log(`1. Verify data in Supabase dashboard`);
    console.log(`2. Test workspace switching in the application`);
    console.log(`3. Update frontend components to use workspace_id`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
migrateToWorkspaces()
  .then(() => {
    console.log('\n✅ Migration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  });
