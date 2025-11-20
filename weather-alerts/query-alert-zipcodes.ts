#!/usr/bin/env -S node --loader ts-node/esm
/**
 * Query helper for weather alert zipcode mappings.
 *
 * Purpose:
 * - Demonstrates usage of zipcode query functions from alertsDb module.
 * - Provides CLI interface to query zipcodes for an alert or alerts for a zipcode.
 *
 * Usage:
 *   # Get all zipcodes for a specific alert:
 *   node --loader ts-node/esm weather-alerts/query-alert-zipcodes.ts alert <alert-id>
 *
 *   # Get all alerts affecting a specific zipcode:
 *   node --loader ts-node/esm weather-alerts/query-alert-zipcodes.ts zipcode <zipcode>
 *
 *   # Get zipcode stats for all alerts:
 *   node --loader ts-node/esm weather-alerts/query-alert-zipcodes.ts stats
 *
 * Environment:
 *   Requires DATABASE_URL for Postgres connection.
 */

import { fileURLToPath } from 'url';
import {
  getZipcodesForAlert,
  getAlertsForZipcode,
  getAllAlerts,
  closePool,
  withClient,
} from './db/alertsDb.js';

const __filename = fileURLToPath(import.meta.url);

/**
 * Get statistics on zipcode coverage across all alerts.
 * @returns Promise that resolves to stats object.
 */
async function getZipcodeStats(): Promise<{
  totalAlerts: number;
  alertsWithZipcodes: number;
  totalZipcodeMappings: number;
  avgZipcodesPerAlert: number;
  topAlertsByZipcodeCount: Array<{ alertId: string; zipcodeCount: number }>;
}> {
  return await withClient(async (client) => {
    // Get total alerts
    const totalAlertsResult = await client.query(
      'SELECT COUNT(*) as count FROM weather_alerts'
    );
    const totalAlerts = parseInt(totalAlertsResult.rows[0].count, 10);

    // Get alerts with zipcodes
    const alertsWithZipcodesResult = await client.query(`
      SELECT COUNT(DISTINCT alert_id) as count 
      FROM weather_alert_zipcodes
    `);
    const alertsWithZipcodes = parseInt(alertsWithZipcodesResult.rows[0].count, 10);

    // Get total mappings
    const totalMappingsResult = await client.query(
      'SELECT COUNT(*) as count FROM weather_alert_zipcodes'
    );
    const totalZipcodeMappings = parseInt(totalMappingsResult.rows[0].count, 10);

    // Get top alerts by zipcode count
    const topAlertsResult = await client.query(`
      SELECT alert_id, COUNT(*) as zipcode_count
      FROM weather_alert_zipcodes
      GROUP BY alert_id
      ORDER BY zipcode_count DESC
      LIMIT 10
    `);
    const topAlertsByZipcodeCount = topAlertsResult.rows.map((row) => ({
      alertId: row.alert_id,
      zipcodeCount: parseInt(row.zipcode_count, 10),
    }));

    const avgZipcodesPerAlert =
      alertsWithZipcodes > 0 ? totalZipcodeMappings / alertsWithZipcodes : 0;

    return {
      totalAlerts,
      alertsWithZipcodes,
      totalZipcodeMappings,
      avgZipcodesPerAlert: Math.round(avgZipcodesPerAlert * 10) / 10,
      topAlertsByZipcodeCount,
    };
  });
}

/**
 * Main entry point: parse CLI args and execute appropriate query.
 */
async function main() {
  try {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
      console.log('Usage:');
      console.log('  query-alert-zipcodes.ts alert <alert-id>');
      console.log('  query-alert-zipcodes.ts zipcode <zipcode>');
      console.log('  query-alert-zipcodes.ts stats');
      process.exit(1);
    }

    if (command === 'alert') {
      const alertId = args[1];
      if (!alertId) {
        console.error('Error: alert-id is required');
        process.exit(1);
      }

      console.log(`Querying zipcodes for alert: ${alertId}`);
      const zipcodes = await getZipcodesForAlert(alertId);
      
      if (zipcodes.length === 0) {
        console.log('No zipcodes found for this alert.');
      } else {
        console.log(`\nFound ${zipcodes.length} zipcodes:`);
        console.log(zipcodes.join(', '));
      }
    } else if (command === 'zipcode') {
      const zipcode = args[1];
      if (!zipcode) {
        console.error('Error: zipcode is required');
        process.exit(1);
      }

      console.log(`Querying alerts affecting zipcode: ${zipcode}`);
      const alerts = await getAlertsForZipcode(zipcode);
      
      if (alerts.length === 0) {
        console.log('No active alerts found for this zipcode.');
      } else {
        console.log(`\nFound ${alerts.length} active alerts:`);
        alerts.forEach((alertId, index) => {
          console.log(`  ${index + 1}. ${alertId}`);
        });
      }
    } else if (command === 'stats') {
      console.log('Querying zipcode coverage statistics...\n');
      const stats = await getZipcodeStats();
      
      console.log('=== Zipcode Coverage Statistics ===');
      console.log(`Total alerts in database: ${stats.totalAlerts}`);
      console.log(`Alerts with zipcode mappings: ${stats.alertsWithZipcodes}`);
      console.log(`Total zipcode mappings: ${stats.totalZipcodeMappings}`);
      console.log(`Average zipcodes per alert: ${stats.avgZipcodesPerAlert}`);
      
      if (stats.topAlertsByZipcodeCount.length > 0) {
        console.log('\nTop 10 alerts by zipcode count:');
        stats.topAlertsByZipcodeCount.forEach((item, index) => {
          console.log(`  ${index + 1}. ${item.alertId}: ${item.zipcodeCount} zipcodes`);
        });
      }
    } else {
      console.error(`Unknown command: ${command}`);
      console.log('Valid commands: alert, zipcode, stats');
      process.exit(1);
    }

    await closePool();
  } catch (error) {
    console.error('\n✗ Error querying zipcodes:');
    console.error(`  ${(error as Error).message}`);
    await closePool();
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { getZipcodeStats };

