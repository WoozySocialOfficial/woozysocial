// Run database migration
const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

// Read the migration file
const migrationPath = path.join(__dirname, 'supabase', 'migrations', '20260121_fix_database_integration.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

console.log('Running migration: 20260121_fix_database_integration.sql');
console.log('Target: ', SUPABASE_URL);
console.log('');

// Parse the Supabase URL to get the project ref
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)[1];

// Prepare the request
const options = {
  hostname: `${projectRef}.supabase.co`,
  path: '/rest/v1/rpc/exec_sql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Prefer': 'return=representation'
  }
};

// Make the request using raw SQL execution
const executeSQL = async () => {
  return new Promise((resolve, reject) => {
    // Create a function to execute raw SQL if it doesn't exist
    const createFunctionSQL = `
CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  EXECUTE sql;
  RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
`;

    // First, try to create the exec_sql function
    console.log('Step 1: Creating exec_sql function...');
    const req1 = https.request(options, (res1) => {
      let data1 = '';
      res1.on('data', (chunk) => { data1 += chunk; });
      res1.on('end', () => {
        console.log('Step 1 Response:', res1.statusCode);

        // Now execute the migration SQL
        console.log('Step 2: Executing migration SQL...');
        const req2 = https.request(options, (res2) => {
          let data2 = '';
          res2.on('data', (chunk) => { data2 += chunk; });
          res2.on('end', () => {
            console.log('Step 2 Response:', res2.statusCode);
            if (res2.statusCode >= 200 && res2.statusCode < 300) {
              console.log('\n✅ Migration completed successfully!');
              resolve();
            } else {
              console.error('\n❌ Migration failed:', data2);
              reject(new Error(data2));
            }
          });
        });

        req2.on('error', reject);
        req2.write(JSON.stringify({ sql: sql }));
        req2.end();
      });
    });

    req1.on('error', reject);
    req1.write(JSON.stringify({ sql: createFunctionSQL }));
    req1.end();
  });
};

// Alternative: Use psql if available
console.log('Attempting to run migration via psql...\n');

const { exec } = require('child_process');
const psqlCommand = `psql "${SUPABASE_URL.replace('https://', 'postgresql://postgres:')}@db.${projectRef}.supabase.co:5432/postgres" -f "${migrationPath}"`;

exec('psql --version', (error) => {
  if (error) {
    console.log('psql not found, will use HTTP method instead');
    console.log('\nPlease run this SQL manually in Supabase SQL Editor:');
    console.log('1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
    console.log('2. Copy the contents of: ' + migrationPath);
    console.log('3. Paste and run the SQL\n');
    process.exit(0);
  } else {
    console.log('psql found, but requires database password.');
    console.log('\nPlease run this SQL manually in Supabase SQL Editor:');
    console.log('1. Go to: https://supabase.com/dashboard/project/' + projectRef + '/sql/new');
    console.log('2. Copy the contents of: ' + migrationPath);
    console.log('3. Paste and run the SQL\n');
    process.exit(0);
  }
});
