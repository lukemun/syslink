#!/usr/bin/env node

/**
 * Fetch and save NWS alert event types as pretty-printed JSON.
 *
 * Uses the National Weather Service API `/alerts/types` endpoint to retrieve
 * the list of recognized alert event types and writes them to
 * `alert-types.json` in this directory.
 *
 * Typical usage:
 *   node fetch-alert-types.js
 *
 * API Docs: https://www.weather.gov/documentation/services-web-api#/default/alerts_types
 * Endpoint: https://api.weather.gov/alerts/types
 */

import https from 'https';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  baseUrl: 'api.weather.gov',
  endpoint: '/alerts/types',
  userAgent: '(syslink-weather-alerts, contact@example.com)', // Required by NWS API
  outputFile: 'alert-types.json',
};

/**
 * Perform a GET request to the NWS API and parse JSON.
 * @param {string} endpointPath - Path portion of the API URL (e.g. `/alerts/types`)
 * @returns {Promise<Object>} Parsed JSON response body
 */
async function fetchJson(endpointPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.baseUrl,
      path: endpointPath,
      method: 'GET',
      headers: {
        'User-Agent': CONFIG.userAgent,
        'Accept': 'application/ld+json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return reject(new Error(`Unexpected redirect to ${res.headers.location}`));
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
      }

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (err) {
          reject(new Error(`Failed to parse JSON: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

/**
 * Main entry point: fetch alert types and write pretty JSON to disk.
 * @returns {Promise<void>}
 */
async function main() {
  try {
    console.log('Fetching NWS alert event types...');
    console.log(`API: https://${CONFIG.baseUrl}${CONFIG.endpoint}`);

    const data = await fetchJson(CONFIG.endpoint);

    const outputPath = path.join(__dirname, CONFIG.outputFile);
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2), 'utf8');

    const count = Array.isArray(data.eventTypes) ? data.eventTypes.length : 0;

    console.log(`\n✓ Saved alert types to ${outputPath}`);
    console.log(`  Event types count: ${count}`);
  } catch (error) {
    console.error('\n✗ Error fetching alert types:');
    console.error(`  ${error.message}`);
    if (error.message.includes('HTTP 403')) {
      console.error('  Tip: Ensure the User-Agent header is properly set per NWS API requirements.');
    }
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { fetchJson };


