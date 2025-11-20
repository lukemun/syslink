#!/usr/bin/env node

/**
 * Fetch Active Weather Alerts for California
 * 
 * Uses the National Weather Service API to retrieve current active alerts
 * for California and saves them as a GeoJSON FeatureCollection.
 * 
 * API Documentation: https://www.weather.gov/documentation/services-web-api
 * Alerts Endpoint: https://api.weather.gov/alerts/active
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
  endpoint: '/alerts/active',
  state: 'CA', // California
  userAgent: '(syslink-weather-alerts, contact@example.com)', // Required by NWS API
  outputFile: 'california-alerts.json'
};

/**
 * Makes an HTTPS GET request to the NWS API
 * @param {string} url - The API endpoint path
 * @returns {Promise<Object>} - Parsed JSON response
 */
function fetchFromAPI(url) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.baseUrl,
      path: url,
      method: 'GET',
      headers: {
        'User-Agent': CONFIG.userAgent,
        'Accept': 'application/geo+json'
      }
    };

    https.get(options, (res) => {
      let data = '';

      // Check for redirect
      if (res.statusCode === 301 || res.statusCode === 302) {
        console.log(`Redirected to: ${res.headers.location}`);
        return reject(new Error('Unexpected redirect'));
      }

      // Check for errors
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
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Formats alert data for display
 * @param {Object} feature - GeoJSON feature containing alert data
 * @returns {string} - Formatted alert summary
 */
function formatAlertSummary(feature) {
  const props = feature.properties;
  return [
    `\n${props.event} - ${props.severity}`,
    `Area: ${props.areaDesc}`,
    `Effective: ${new Date(props.effective).toLocaleString()}`,
    `Expires: ${new Date(props.expires).toLocaleString()}`,
    `Headline: ${props.headline}`,
    `---`
  ].join('\n');
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('Fetching active weather alerts for California...');
    console.log(`API: https://${CONFIG.baseUrl}${CONFIG.endpoint}?area=${CONFIG.state}\n`);

    // Build the query URL
    const queryUrl = `${CONFIG.endpoint}?area=${CONFIG.state}`;

    // Fetch alerts from NWS API
    const alertData = await fetchFromAPI(queryUrl);

    // Validate response structure
    if (!alertData.features || !Array.isArray(alertData.features)) {
      throw new Error('Invalid response format: missing features array');
    }

    // Display summary
    console.log(`✓ Retrieved ${alertData.features.length} active alerts for California\n`);

    if (alertData.features.length > 0) {
      console.log('Alert Summary:');
      console.log('='.repeat(80));
      
      // Group alerts by severity
      const bySeverity = {};
      alertData.features.forEach(feature => {
        const severity = feature.properties.severity || 'Unknown';
        bySeverity[severity] = (bySeverity[severity] || 0) + 1;
      });

      console.log('\nBy Severity:');
      Object.entries(bySeverity)
        .sort(([, a], [, b]) => b - a)
        .forEach(([severity, count]) => {
          console.log(`  ${severity}: ${count}`);
        });

      console.log('\nRecent Alerts (first 5):');
      alertData.features.slice(0, 5).forEach(feature => {
        console.log(formatAlertSummary(feature));
      });
    } else {
      console.log('✓ No active alerts for California at this time.');
    }

    // Save to file
    const outputPath = path.join(__dirname, CONFIG.outputFile);
    await fs.writeFile(
      outputPath,
      JSON.stringify(alertData, null, 2),
      'utf8'
    );

    console.log(`\n✓ Alert data saved to: ${outputPath}`);
    console.log(`  File size: ${(JSON.stringify(alertData).length / 1024).toFixed(2)} KB`);
    console.log(`  Format: GeoJSON FeatureCollection`);
    
    // Display metadata
    if (alertData['@context']) {
      console.log(`  Context: GeoJSON-LD with wx:Alert vocabulary`);
    }

    console.log('\n✓ Done!');

  } catch (error) {
    console.error('\n✗ Error fetching weather alerts:');
    console.error(`  ${error.message}`);
    
    if (error.message.includes('ENOTFOUND')) {
      console.error('\n  Tip: Check your internet connection and DNS settings.');
    } else if (error.message.includes('HTTP 403')) {
      console.error('\n  Tip: Ensure the User-Agent header is properly set.');
    }
    
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { fetchFromAPI, formatAlertSummary };

