#!/usr/bin/env node

/**
 * Database Backup Script
 * Exports all critical tables to JSON files
 * Run: node scripts/backup-database.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BACKUP_DIR = path.join(__dirname, '../../BACKUPS');
const TIMESTAMP = new Date().toISOString().replace(/:/g, '-').split('.')[0];

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// Tables to backup (in order of importance)
const TABLES = [
  'posts',
  'post_drafts',
  'workspaces',
  'workspace_members',
  'user_profiles',
  'workspace_invites',
  'short_links',
  'post_comments',
  'comment_replies',
  'comment_drafts',
  'notifications',
  'inbox_conversations',
  'inbox_messages',
  'inbox_read_status',
  'inbox_webhook_events'
];

async function backupTable(tableName) {
  console.log(`\nBacking up ${tableName}...`);

  try {
    const { data, error, count } = await supabase
      .from(tableName)
      .select('*', { count: 'exact' });

    if (error) {
      console.error(`❌ Error backing up ${tableName}:`, error.message);
      return { tableName, success: false, error: error.message };
    }

    const rowCount = data?.length || 0;
    console.log(`✅ ${tableName}: ${rowCount} rows`);

    return { tableName, success: true, rowCount, data };
  } catch (err) {
    console.error(`❌ Exception backing up ${tableName}:`, err.message);
    return { tableName, success: false, error: err.message };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('DATABASE BACKUP TOOL');
  console.log(`Timestamp: ${TIMESTAMP}`);
  console.log('='.repeat(60));

  // Create backup directory if it doesn't exist
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`\n📁 Created backup directory: ${BACKUP_DIR}`);
  }

  const results = [];
  const backupData = {
    timestamp: TIMESTAMP,
    tables: {}
  };

  // Backup each table
  for (const table of TABLES) {
    const result = await backupTable(table);
    results.push(result);

    if (result.success) {
      backupData.tables[table] = result.data;
    }
  }

  // Save combined backup file
  const backupFile = path.join(BACKUP_DIR, `backup_${TIMESTAMP}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
  console.log(`\n💾 Saved combined backup: ${backupFile}`);

  // Save individual table files
  const tableDir = path.join(BACKUP_DIR, `tables_${TIMESTAMP}`);
  if (!fs.existsSync(tableDir)) {
    fs.mkdirSync(tableDir, { recursive: true });
  }

  for (const result of results) {
    if (result.success && result.data) {
      const tableFile = path.join(tableDir, `${result.tableName}.json`);
      fs.writeFileSync(tableFile, JSON.stringify(result.data, null, 2));
    }
  }
  console.log(`📁 Saved individual tables: ${tableDir}`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('BACKUP SUMMARY');
  console.log('='.repeat(60));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Successful: ${successful.length} tables`);
  successful.forEach(r => {
    console.log(`   - ${r.tableName}: ${r.rowCount} rows`);
  });

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length} tables`);
    failed.forEach(r => {
      console.log(`   - ${r.tableName}: ${r.error}`);
    });
  }

  const totalRows = successful.reduce((sum, r) => sum + r.rowCount, 0);
  console.log(`\n📊 Total rows backed up: ${totalRows}`);
  console.log(`💾 Backup location: ${BACKUP_DIR}`);

  // Create latest backup symlink/copy
  const latestFile = path.join(BACKUP_DIR, 'latest_backup.json');
  fs.copyFileSync(backupFile, latestFile);
  console.log(`\n🔗 Latest backup: ${latestFile}`);

  console.log('\n✅ Backup complete!');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('\n❌ Backup failed:', err);
  process.exit(1);
});
