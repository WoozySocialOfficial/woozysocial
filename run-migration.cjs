const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://adyeceovkhnacaxkymih.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkeWVjZW92a2huYWNheGt5bWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5OTIyMTYsImV4cCI6MjA4MjU2ODIxNn0.6I91p60VPUlkpfnftMRejPMhaHM9H3kz9hk1zUxCFL4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('Running migration: add_workspace_id_to_post_drafts.sql');

    const migrationPath = path.join(__dirname, 'database', 'migrations', 'add_workspace_id_to_post_drafts.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Check if the column already exists
    const { data: columns, error: checkError } = await supabase
      .from('post_drafts')
      .select('workspace_id')
      .limit(1);

    if (checkError) {
      if (checkError.message.includes('column') && checkError.message.includes('does not exist')) {
        console.log('workspace_id column does not exist. Adding it now...');

        // Use the rpc method to execute raw SQL
        console.log('Note: This migration needs to be run directly in Supabase SQL Editor.');
        console.log('Please copy and paste the following SQL into your Supabase SQL Editor:');
        console.log('\n---BEGIN SQL---');
        console.log(sql);
        console.log('---END SQL---\n');

        console.log('Or run this manually:');
        console.log('ALTER TABLE post_drafts ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;');
        console.log('CREATE INDEX IF NOT EXISTS post_drafts_workspace_id_idx ON post_drafts(workspace_id);');
      } else {
        console.error('Error checking column:', checkError);
      }
    } else {
      console.log('✓ workspace_id column already exists in post_drafts table');
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
