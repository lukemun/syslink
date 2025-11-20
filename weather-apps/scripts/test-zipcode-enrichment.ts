#!/usr/bin/env -S node --loader ts-node/esm
/**
 * Simple integration test for zipcode enrichment functionality.
 *
 * Purpose:
 * - Verifies that zipcode functions work correctly.
 * - Tests upsert behavior (idempotency, no duplicates).
 * - Tests query functions for alerts and zipcodes.
 *
 * Usage:
 *   node --loader ts-node/esm weather-alerts/test-zipcode-enrichment.ts
 *
 * Environment:
 *   Requires DATABASE_URL for Postgres connection.
 */

import {
  upsertAlerts,
  upsertAlertZipcodes,
  getZipcodesForAlert,
  getAlertsForZipcode,
  closePool,
  withClient,
  AlertRow,
} from './db/alertsDb.js';

/**
 * Create test alerts in the database.
 */
async function setupTestAlerts() {
  const testAlerts: AlertRow[] = [
    {
      id: 'test-alert-001',
      event: 'Test Event',
      status: 'Actual',
      severity: 'Severe',
      certainty: 'Likely',
      urgency: 'Immediate',
      area_desc: 'Test Area',
      nws_office: 'Test Office',
      sent: new Date(),
      effective: new Date(),
      onset: null,
      expires: new Date(Date.now() + 3600000),
      is_damaged: false,
      raw: { type: 'Feature', properties: {}, geometry: null },
    },
    {
      id: 'test-alert-002',
      event: 'Test Event 2',
      status: 'Actual',
      severity: 'Severe',
      certainty: 'Likely',
      urgency: 'Immediate',
      area_desc: 'Test Area 2',
      nws_office: 'Test Office',
      sent: new Date(),
      effective: new Date(),
      onset: null,
      expires: new Date(Date.now() + 3600000),
      is_damaged: false,
      raw: { type: 'Feature', properties: {}, geometry: null },
    },
  ];
  
  await upsertAlerts(testAlerts);
}

/**
 * Test upsert behavior with duplicate zipcodes.
 */
async function testUpsertIdempotency() {
  console.log('Test 1: Upsert idempotency');
  
  const testAlertId = 'test-alert-001';
  const zipcodes = ['90001', '90002', '90003'];
  
  // Insert once
  await upsertAlertZipcodes(testAlertId, zipcodes);
  const firstResult = await getZipcodesForAlert(testAlertId);
  console.log(`  First upsert: ${firstResult.length} zipcodes`);
  
  // Insert again with same data (should not create duplicates)
  await upsertAlertZipcodes(testAlertId, zipcodes);
  const secondResult = await getZipcodesForAlert(testAlertId);
  console.log(`  Second upsert: ${secondResult.length} zipcodes`);
  
  // Insert again with overlapping data
  await upsertAlertZipcodes(testAlertId, ['90003', '90004', '90005']);
  const thirdResult = await getZipcodesForAlert(testAlertId);
  console.log(`  Third upsert (with new zips): ${thirdResult.length} zipcodes`);
  
  if (secondResult.length === 3 && thirdResult.length === 5) {
    console.log('  ✓ Idempotency test passed\n');
    return true;
  } else {
    console.log('  ✗ Idempotency test failed\n');
    return false;
  }
}

/**
 * Test reverse lookup: get alerts by zipcode.
 */
async function testReverseLookup() {
  console.log('Test 2: Reverse lookup (alerts by zipcode)');
  
  const testZipcode = '90001';
  const testAlerts = ['test-alert-001', 'test-alert-002'];
  
  // Upsert the zipcode for multiple alerts
  await upsertAlertZipcodes(testAlerts[0], [testZipcode]);
  await upsertAlertZipcodes(testAlerts[1], [testZipcode]);
  
  const alerts = await getAlertsForZipcode(testZipcode);
  console.log(`  Found ${alerts.length} alerts for zipcode ${testZipcode}`);
  
  // Check that both test alerts are present
  const hasAlert1 = alerts.includes(testAlerts[0]);
  const hasAlert2 = alerts.includes(testAlerts[1]);
  
  if (hasAlert1 && hasAlert2) {
    console.log('  ✓ Reverse lookup test passed\n');
    return true;
  } else {
    console.log('  ✗ Reverse lookup test failed\n');
    return false;
  }
}

/**
 * Test cascade delete behavior (manual verification needed).
 */
async function testCascadeDelete() {
  console.log('Test 3: Cascade delete verification');
  console.log('  Note: This test only verifies the FK exists, not the actual cascade behavior.');
  
  // Check that the foreign key constraint exists
  const result = await withClient(async (client) => {
    const query = `
      SELECT constraint_name, table_name
      FROM information_schema.table_constraints
      WHERE constraint_type = 'FOREIGN KEY'
        AND table_name = 'weather_alert_zipcodes'
    `;
    return await client.query(query);
  });
  
  if (result.rows.length > 0) {
    console.log(`  Found ${result.rows.length} FK constraint(s)`);
    console.log('  ✓ Foreign key constraint exists\n');
    return true;
  } else {
    console.log('  ✗ No foreign key constraint found\n');
    return false;
  }
}

/**
 * Test unique constraint (should prevent duplicate alert_id + zipcode pairs).
 */
async function testUniqueConstraint() {
  console.log('Test 4: Unique index verification');
  
  const result = await withClient(async (client) => {
    const query = `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'weather_alert_zipcodes'
        AND indexdef LIKE '%UNIQUE%'
    `;
    return await client.query(query);
  });
  
  if (result.rows.length > 0) {
    console.log(`  Found ${result.rows.length} unique index(es)`);
    console.log('  ✓ Unique index exists\n');
    return true;
  } else {
    console.log('  ✗ No unique index found\n');
    return false;
  }
}

/**
 * Clean up test data.
 */
async function cleanupTestData() {
  console.log('Cleaning up test data...');
  
  await withClient(async (client) => {
    // Delete zipcodes first (will be cascaded anyway, but let's be explicit)
    await client.query(`
      DELETE FROM weather_alert_zipcodes 
      WHERE alert_id LIKE 'test-alert-%'
    `);
    
    // Delete test alerts
    await client.query(`
      DELETE FROM weather_alerts 
      WHERE id LIKE 'test-alert-%'
    `);
  });
  
  console.log('✓ Cleanup complete\n');
}

/**
 * Main test runner.
 */
async function main() {
  try {
    console.log('=== Weather Alert Zipcode Enrichment Tests ===\n');
    
    console.log('Setting up test alerts...');
    await setupTestAlerts();
    console.log('✓ Test alerts created\n');
    
    const results = [];
    
    results.push(await testUpsertIdempotency());
    results.push(await testReverseLookup());
    results.push(await testCascadeDelete());
    results.push(await testUniqueConstraint());
    
    await cleanupTestData();
    
    const passed = results.filter(r => r).length;
    const total = results.length;
    
    console.log('=== Test Summary ===');
    console.log(`Passed: ${passed}/${total}`);
    
    if (passed === total) {
      console.log('✓ All tests passed!');
    } else {
      console.log('✗ Some tests failed.');
      process.exit(1);
    }
    
    await closePool();
  } catch (error) {
    console.error('\n✗ Error running tests:');
    console.error(`  ${(error as Error).message}`);
    console.error((error as Error).stack);
    await closePool();
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

