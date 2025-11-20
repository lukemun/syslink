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
  }
}

