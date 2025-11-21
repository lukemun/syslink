#!/usr/bin/env node
/**
 * Test database connection with both direct and pooler URLs
 * 
 * Usage:
 *   node test-connection.js
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

const { Pool } = pg;

// Load environment variables
const envPath = resolve(process.cwd(), '../../../.env');
const result = config({ path: envPath });
if (result.error) {
  console.log(`⚠️  Could not load .env from ${envPath}`);
  console.log('   Make sure DATABASE_URL and DATABASE_POOLER_URL are in your environment');
}

async function testConnection(name, connectionString) {
  if (!connectionString) {
    console.log(`\n❌ ${name}: Not configured (connection string is empty)`);
    return false;
  }

  // Hide password in logs
  const safeUrl = connectionString.replace(/:([^:@]+)@/, ':****@');
  console.log(`\n🔍 Testing ${name}...`);
  console.log(`   URL: ${safeUrl}`);

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 20000,
    statement_timeout: 5000,
  });

  try {
    const start = Date.now();
    const client = await pool.connect();
    const connectTime = Date.now() - start;
    
    try {
      const queryStart = Date.now();
      const result = await client.query('SELECT NOW() as now, version() as version');
      const queryTime = Date.now() - queryStart;
      
      console.log(`   ✅ Connected in ${connectTime}ms`);
      console.log(`   ✅ Query executed in ${queryTime}ms`);
      console.log(`   📅 Server time: ${result.rows[0].now}`);
      console.log(`   🐘 Version: ${result.rows[0].version.split(' ').slice(0, 2).join(' ')}`);
      
      client.release();
      return true;
    } catch (error) {
      console.log(`   ❌ Query failed: ${error.message}`);
      client.release();
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Connection failed: ${error.message}`);
    return false;
  } finally {
    await pool.end();
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Database Connection Test');
  console.log('═══════════════════════════════════════════════════');

  const results = {
    direct: await testConnection('DIRECT CONNECTION (DATABASE_URL)', process.env.DATABASE_URL),
    pooler: await testConnection('POOLER CONNECTION (DATABASE_POOLER_URL)', process.env.DATABASE_POOLER_URL),
  };

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Direct Connection:  ${results.direct ? '✅ WORKING' : '❌ FAILED'}`);
  console.log(`  Pooler Connection:  ${results.pooler ? '✅ WORKING' : '❌ FAILED'}`);
  console.log('═══════════════════════════════════════════════════');

  if (results.pooler) {
    console.log('\n✅ Pooler connection is working! Deploy with confidence.');
  } else if (results.direct) {
    console.log('\n⚠️  Pooler failed but direct connection works.');
    console.log('   Check your DATABASE_POOLER_URL configuration.');
  } else {
    console.log('\n❌ Both connections failed. Check your configuration.');
  }

  process.exit(results.pooler || results.direct ? 0 : 1);
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

