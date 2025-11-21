/**
 * Weather Crawler Lambda Handler
 *
 * Purpose:
 * - Hourly Cron job that fetches active NWS alerts and ingests them into the database.
 * - Combines fetch and ingest operations into a single Lambda function.
 *
 * Usage:
 *   Deployed as an AWS Lambda function triggered by EventBridge (CloudWatch Events) on a schedule.
 *
 * Environment:
 *   Requires DATABASE_URL for Postgres connection.
 */

import { fetchAlerts } from './fetch.js';
import { ingestAlerts } from './ingest.js';
import { closePool } from './db.js';

export async function handler(event: any) {
  console.log('=== Weather Crawler Lambda Started ===');
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Timestamp:', new Date().toISOString());

  try {
    // Step 1: Fetch active alerts from NWS API
    console.log('\n--- Step 1: Fetching active alerts ---');
    const alertData = await fetchAlerts();
    
    if (!alertData || !alertData.features || alertData.features.length === 0) {
      console.log('No alerts to process. Exiting.');
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'No active alerts found',
          timestamp: new Date().toISOString(),
        }),
      };
    }

    // Step 2: Ingest alerts into database
    console.log('\n--- Step 2: Ingesting alerts into database ---');
    await ingestAlerts(alertData);

    console.log('\n=== Weather Crawler Lambda Completed Successfully ===');
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Successfully processed alerts',
        alertCount: alertData.features.length,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('\n=== Weather Crawler Lambda Failed ===');
    console.error('Error:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to process alerts',
        error: (error as Error).message,
        timestamp: new Date().toISOString(),
      }),
    };
  } finally {
    // Always close the database connection pool to prevent connection leaks
    console.log('Closing database connection pool...');
    await closePool();
  }
}

// Main function for local testing
async function main() {
  // Parse command-line arguments
  const args = process.argv.slice(2);
  const flags = {
    dryRun: args.includes('--dry-run') || args.includes('-d'),
    zipDebug: args.includes('--zip-debug') || args.includes('-z'),
    damageDebug: args.includes('--damage-debug'),
    noSsl: args.includes('--no-ssl-verify'),
    help: args.includes('--help') || args.includes('-h'),
  };

  if (flags.help) {
    console.log(`
Weather Crawler - Local Test Runner

Usage: node --loader ts-node/esm src/index.ts [options]

Options:
  -d, --dry-run           Skip database writes (auto-enabled if no DATABASE_URL)
  -z, --zip-debug         Enable ZIP refinement experimental logging
  --damage-debug          Enable verbose damage evaluation logging
  --no-ssl-verify         Disable SSL certificate verification (for local testing)
  -h, --help              Show this help message

Examples:
  # Basic dry-run test
  node --loader ts-node/esm src/index.ts --dry-run

  # Test with ZIP refinement logging
  node --loader ts-node/esm src/index.ts --dry-run --zip-debug

  # Full local test with all debug flags
  node --loader ts-node/esm src/index.ts -d -z --damage-debug --no-ssl-verify
`);
    process.exit(0);
  }

  // Load .env file for local testing
  try {
    const { config } = await import('dotenv');
    config({ path: '../../../.env' });
    console.log('✓ Loaded environment variables from .env\n');
  } catch (err) {
    console.log('Note: Could not load .env file (may not be needed)\n');
  }

  // Apply flags to environment variables
  if (flags.dryRun || !process.env.DATABASE_URL) {
    if (!process.env.DATABASE_URL) {
      console.log('⚠️  DATABASE_URL not set - running in DRY-RUN mode');
    } else {
      console.log('⚠️  DRY-RUN mode enabled via --dry-run flag');
    }
    console.log('    Alerts will be fetched and processed, but NOT written to database\n');
    process.env.DRY_RUN = '1';
  }

  if (flags.zipDebug) {
    console.log('🔬 ZIP refinement debug logging enabled\n');
    process.env.ZIP_REFINEMENT_DEBUG = '1';
  }

  if (flags.damageDebug) {
    console.log('🔍 Damage evaluation debug logging enabled\n');
    process.env.DEBUG_DAMAGE = '1';
  }

  if (flags.noSsl) {
    console.log('⚠️  SSL verification disabled (for local testing only)\n');
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }

  console.log('Running crawler locally...\n');
  
  const result = await handler({
    source: 'local-test',
    time: new Date().toISOString(),
  });
  
  console.log('\n--- Lambda Result ---');
  console.log('Status Code:', result.statusCode);
  console.log('Body:', result.body);
  
  process.exit(result.statusCode === 200 ? 0 : 1);
}

// Run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
