#!/usr/bin/env node

/**
 * Register Production Webhook Script
 *
 * This script helps you register the webhook with Ayrshare for production.
 * It fetches a workspace ID from your database and registers the production webhook URL.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../functions/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
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

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(colors.cyan + question + colors.reset, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function getWorkspaces() {
  logSection('Fetching Workspaces from Database');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: workspaces, error } = await supabase
    .from('workspaces')
    .select('id, name, ayr_profile_key')
    .not('ayr_profile_key', 'is', null)
    .limit(10);

  if (error) {
    logError('Failed to fetch workspaces');
    logInfo(`Error: ${error.message}`);
    throw new Error('Database error');
  }

  if (!workspaces || workspaces.length === 0) {
    logWarning('No workspaces found with Ayrshare profile key');
    logInfo('Create a workspace and connect social accounts first');
    throw new Error('No workspaces available');
  }

  return workspaces;
}

async function registerWebhook(workspaceId, apiUrl) {
  logSection('Registering Webhook with Production URL');

  const webhookUrl = `${apiUrl}/api/inbox/webhook`;

  logInfo(`API URL: ${apiUrl}`);
  logInfo(`Webhook URL: ${webhookUrl}`);
  logInfo(`Workspace ID: ${workspaceId}`);

  try {
    const response = await axios.post(
      `${apiUrl}/api/inbox/setup-webhook`,
      { workspaceId },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      }
    );

    if (response.data && response.data.success) {
      logSuccess('Webhook registered successfully!');
      logInfo(`Response: ${JSON.stringify(response.data, null, 2)}`);
      return true;
    } else {
      logWarning('Unexpected response from webhook registration');
      logInfo(`Response: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    logError('Failed to register webhook');
    if (error.response) {
      logInfo(`Status: ${error.response.status}`);
      logInfo(`Data: ${JSON.stringify(error.response.data, null, 2)}`);

      // Check if it's already registered
      if (error.response.data?.message?.includes('already') ||
          error.response.status === 409) {
        logSuccess('Webhook appears to be already registered');
        return true;
      }
    } else {
      logInfo(`Error: ${error.message}`);
    }
    return false;
  }
}

async function main() {
  log('\n' + colors.bright + colors.blue + '🚀 Production Webhook Registration' + colors.reset);
  log(colors.blue + 'This will register the webhook with your production URL' + colors.reset + '\n');

  try {
    // Step 1: Get production URL
    logSection('Step 1: Enter Production URL');
    log('Enter your production API URL (e.g., https://woozysocials.com)');
    log('Press Enter to use default: https://woozysocials.com\n');

    const apiUrl = await prompt('Production API URL: ') || 'https://woozysocials.com';

    if (!apiUrl.startsWith('http')) {
      throw new Error('Invalid URL format. Must start with http:// or https://');
    }

    logSuccess(`Using API URL: ${apiUrl}`);

    // Step 2: Get workspaces
    const workspaces = await getWorkspaces();

    logSuccess(`Found ${workspaces.length} workspace(s) with Ayrshare profiles:`);
    workspaces.forEach((ws, idx) => {
      log(`  ${idx + 1}. ${ws.name} (${ws.id})`, colors.cyan);
    });

    // Step 3: Select workspace
    log('');
    const selection = await prompt(`Select workspace (1-${workspaces.length}): `);
    const selectedIndex = parseInt(selection) - 1;

    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= workspaces.length) {
      throw new Error('Invalid selection');
    }

    const selectedWorkspace = workspaces[selectedIndex];
    logSuccess(`Selected: ${selectedWorkspace.name}`);

    // Step 4: Register webhook
    const success = await registerWebhook(selectedWorkspace.id, apiUrl);

    // Step 5: Summary
    logSection('Summary');

    if (success) {
      logSuccess('✅ Webhook registration completed successfully!');
      log('');
      log(colors.bright + 'What\'s Next:' + colors.reset);
      log('1. Test the Social Inbox on your production site');
      log('2. Send a test DM to your connected social account');
      log('3. Verify the message appears in the inbox');
      log('4. Check webhook events in the database:');
      logInfo('   SELECT * FROM inbox_webhook_events ORDER BY created_at DESC LIMIT 10;');
      log('');
      log(colors.green + colors.bright + '🎉 You\'re ready to test on production!' + colors.reset);
    } else {
      logWarning('⚠️ Webhook registration may have failed');
      log('');
      log(colors.bright + 'Troubleshooting:' + colors.reset);
      log('1. Verify your production URL is correct');
      log('2. Check that the backend is deployed and accessible');
      log('3. Try registering manually via Ayrshare dashboard');
      log('4. Check Vercel function logs for errors');
    }

    log('');
    process.exit(success ? 0 : 1);

  } catch (error) {
    log('\n' + colors.red + colors.bright + '✗ Registration failed!' + colors.reset);
    logError(error.message);
    log('');
    log(colors.bright + 'Need Help?' + colors.reset);
    log('Check the deployment guide: VERCEL_DEPLOYMENT_STEPS.md');
    log('');
    process.exit(1);
  }
}

// Run the script
main();
