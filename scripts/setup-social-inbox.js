#!/usr/bin/env node

/**
 * Social Inbox Setup & Verification Script
 *
 * This script:
 * 1. Verifies database tables exist
 * 2. Checks Ayrshare API configuration
 * 3. Registers webhook with Ayrshare
 * 4. Tests basic API endpoints
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../functions/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY;
const APP_URL = process.env.APP_URL || 'http://localhost:3001';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✓ ${message}`, colors.green);
}

function logError(message) {
  log(`✗ ${message}`, colors.red);
}

function logWarning(message) {
  log(`⚠ ${message}`, colors.yellow);
}

function logInfo(message) {
  log(`ℹ ${message}`, colors.blue);
}

function logSection(message) {
  log(`\n${'='.repeat(60)}`, colors.bright);
  log(message, colors.bright);
  log('='.repeat(60), colors.bright);
}

async function verifyEnvironmentVariables() {
  logSection('1. Verifying Environment Variables');

  const required = {
    'SUPABASE_URL': SUPABASE_URL,
    'SUPABASE_SERVICE_ROLE_KEY': SUPABASE_SERVICE_ROLE_KEY,
    'AYRSHARE_API_KEY': AYRSHARE_API_KEY,
  };

  let allPresent = true;
  for (const [key, value] of Object.entries(required)) {
    if (value) {
      logSuccess(`${key} is configured`);
    } else {
      logError(`${key} is missing`);
      allPresent = false;
    }
  }

  if (!allPresent) {
    throw new Error('Missing required environment variables');
  }

  return true;
}

async function verifyDatabaseTables() {
  logSection('2. Verifying Database Tables');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const tables = [
    'inbox_conversations',
    'inbox_messages',
    'inbox_read_status',
    'inbox_webhook_events'
  ];

  let allExist = true;

  for (const table of tables) {
    try {
      const { error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        logError(`Table '${table}' does not exist or is not accessible`);
        logInfo(`  Error: ${error.message}`);
        allExist = false;
      } else {
        logSuccess(`Table '${table}' exists (${count || 0} rows)`);
      }
    } catch (err) {
      logError(`Failed to check table '${table}': ${err.message}`);
      allExist = false;
    }
  }

  if (!allExist) {
    logWarning('\nSome tables are missing. Run the migration:');
    logInfo('  psql $DATABASE_URL < migrations/004_inbox_tables.sql');
    throw new Error('Database tables not found');
  }

  return true;
}

async function testAyrshareAPI() {
  logSection('3. Testing Ayrshare API Connection');

  try {
    const response = await axios.get('https://api.ayrshare.com/api/user', {
      headers: {
        'Authorization': `Bearer ${AYRSHARE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (response.data) {
      logSuccess('Ayrshare API is accessible');
      logInfo(`  User: ${response.data.email || 'N/A'}`);
      logInfo(`  Domain: ${response.data.domain || 'N/A'}`);
      return true;
    }
  } catch (error) {
    logError('Failed to connect to Ayrshare API');
    if (error.response) {
      logInfo(`  Status: ${error.response.status}`);
      logInfo(`  Message: ${error.response.data?.message || error.message}`);
    } else {
      logInfo(`  Error: ${error.message}`);
    }
    throw new Error('Ayrshare API connection failed');
  }
}

async function getFirstWorkspace() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: workspaces, error } = await supabase
    .from('workspaces')
    .select('id, name, ayr_profile_key')
    .not('ayr_profile_key', 'is', null)
    .limit(1);

  if (error || !workspaces || workspaces.length === 0) {
    return null;
  }

  return workspaces[0];
}

async function registerWebhook() {
  logSection('4. Registering Webhook with Ayrshare');

  // Get a workspace to use for webhook registration
  const workspace = await getFirstWorkspace();

  if (!workspace) {
    logWarning('No workspace with Ayrshare profile found');
    logInfo('  Create a workspace and connect social accounts first');
    return false;
  }

  logInfo(`Using workspace: ${workspace.name} (${workspace.id})`);
  logInfo(`Profile Key: ${workspace.ayr_profile_key}`);

  const webhookUrl = `${APP_URL}/api/inbox/webhook`;
  logInfo(`Webhook URL: ${webhookUrl}`);

  try {
    const response = await axios.post(
      'https://api.ayrshare.com/api/hook/webhook',
      {
        action: 'messages',
        url: webhookUrl
      },
      {
        headers: {
          'Authorization': `Bearer ${AYRSHARE_API_KEY}`,
          'Profile-Key': workspace.ayr_profile_key,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data) {
      logSuccess('Webhook registered successfully');
      logInfo(`  Response: ${JSON.stringify(response.data, null, 2)}`);
      return true;
    }
  } catch (error) {
    logWarning('Webhook registration encountered an issue');
    if (error.response) {
      logInfo(`  Status: ${error.response.status}`);
      logInfo(`  Data: ${JSON.stringify(error.response.data, null, 2)}`);

      // Webhook might already be registered, which is okay
      if (error.response.data?.message?.includes('already') ||
          error.response.status === 409) {
        logSuccess('Webhook appears to be already registered');
        return true;
      }
    } else {
      logInfo(`  Error: ${error.message}`);
    }

    // Don't throw - webhook registration can be done manually
    logWarning('You may need to register the webhook manually');
    return false;
  }
}

async function testConversationsAPI() {
  logSection('5. Testing Conversations API');

  const workspace = await getFirstWorkspace();

  if (!workspace) {
    logWarning('No workspace available for testing');
    return false;
  }

  try {
    const response = await axios.get(
      `${APP_URL}/api/inbox/conversations?workspaceId=${workspace.id}&refresh=true`,
      {
        timeout: 15000
      }
    );

    if (response.data && response.data.success !== false) {
      logSuccess('Conversations API is working');
      const data = response.data;
      logInfo(`  Total conversations: ${data.conversations?.length || 0}`);
      logInfo(`  Total unread: ${data.totalUnread || 0}`);

      if (data.platformStats) {
        Object.entries(data.platformStats).forEach(([platform, stats]) => {
          if (stats.total > 0) {
            logInfo(`  ${platform}: ${stats.total} conversations (${stats.unread} unread)`);
          }
        });
      }

      return true;
    }
  } catch (error) {
    logError('Failed to test Conversations API');
    if (error.response) {
      logInfo(`  Status: ${error.response.status}`);
      logInfo(`  Message: ${error.response.data?.error || error.message}`);
    } else {
      logInfo(`  Error: ${error.message}`);
    }
    return false;
  }
}

async function displaySummary() {
  logSection('Setup Summary');

  logInfo('Social Inbox components:');
  logSuccess('  ✓ Frontend: src/components/SocialInboxContent.jsx');
  logSuccess('  ✓ Hook: src/hooks/useInbox.js');
  logSuccess('  ✓ API: api/inbox/*.js');
  logSuccess('  ✓ Route: /social-inbox');
  logSuccess('  ✓ Navigation: Added to sidebar');

  log('\n' + colors.bright + 'Next Steps:' + colors.reset);
  log('1. Start the development server:');
  logInfo('   npm run dev (frontend)');
  logInfo('   npm run dev (functions)');
  log('2. Navigate to: http://localhost:5173/social-inbox');
  log('3. Connect social accounts if not already done');
  log('4. Test sending/receiving messages on connected platforms');

  log('\n' + colors.bright + 'Testing Checklist:' + colors.reset);
  log('  □ View conversations list');
  log('  □ Click on a conversation to view messages');
  log('  □ Send a reply to a conversation');
  log('  □ Verify real-time polling (30s interval)');
  log('  □ Test platform filtering (Facebook, Instagram, Twitter)');
  log('  □ Test message filter (All, Unread, Replied)');
  log('  □ Verify Instagram 7-day window warning');
}

async function main() {
  log('\n' + colors.bright + colors.blue + '🚀 Social Inbox Setup Script' + colors.reset);
  log(colors.blue + 'This will verify and configure the social inbox feature' + colors.reset + '\n');

  try {
    await verifyEnvironmentVariables();
    await verifyDatabaseTables();
    await testAyrshareAPI();
    await registerWebhook();
    await testConversationsAPI();
    await displaySummary();

    log('\n' + colors.green + colors.bright + '✓ Setup completed successfully!' + colors.reset + '\n');
    process.exit(0);
  } catch (error) {
    log('\n' + colors.red + colors.bright + '✗ Setup failed!' + colors.reset);
    logError(error.message);
    log('');
    process.exit(1);
  }
}

// Run the script
main();
