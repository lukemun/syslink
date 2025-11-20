#!/usr/bin/env node

/**
 * Fetch and save currently active NWS alerts as GeoJSON.
 *
 * Uses the National Weather Service `/alerts/active` endpoint to retrieve
 * all currently active alerts (optionally filtered by state/area) that match
 * specific status, severity, certainty, and event-type filters, and writes
 * the response to a pretty-printed JSON file in this directory.
 *
 * Filter configuration is centralized in `alert-params-config.js`:
 *   - AVAILABLE_PARAMS: documents all relevant NWS alert parameters.
 *   - USED_FILTERS.api: API query filters (status, area).
 *   - USED_FILTERS.client: severity/certainty gates applied after fetching.
 *   - DAMAGE_EVENT_CONFIG: which NWS event types are property-damage-relevant.
 *
 * Typical usage:
 *   # All filtered active alerts in the U.S.
 *   node fetch-active-alerts.js
 *
 *   # Filtered active alerts for a specific state (e.g. CA, KS)
 *   AREA=CA node fetch-active-alerts.js
 *
 *   # Show which event types appeared but are not in DAMAGE_EVENT_CONFIG.primaryUsed
 *   DEBUG_EVENTS=1 node fetch-active-alerts.js
 *
 * API Docs: https://www.weather.gov/documentation/services-web-api
 * Endpoint: https://api.weather.gov/alerts/active
 */

import https from 'https';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { USED_FILTERS, DAMAGE_EVENT_CONFIG } from './alert-params-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  baseUrl: 'api.weather.gov',
  endpoint: '/alerts/active',
  userAgent: '(syslink-weather-alerts, contact@example.com)', // Required by NWS API
};

/**
 * Perform a GET request to the NWS API and parse JSON.
 * @param {string} endpointPath - Path portion of the API URL, including query string.
 * @returns {Promise<Object>} Parsed JSON response body.
 */
async function fetchJson(endpointPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.baseUrl,
      path: endpointPath,
      method: 'GET',
      headers: {
        'User-Agent': CONFIG.userAgent,
        'Accept': 'application/geo+json',
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
 * Main entry point: fetch active alerts and write pretty JSON to disk.
 * @returns {Promise<void>}
 */
async function main() {
  try {
    const area = process.env.AREA && String(process.env.AREA).trim();
    const params = [];

    // Server-side filters:
    // Only actual alerts (exclude tests, system, exercises, etc.).
    // We keep this in USED_FILTERS.api.status so it is easy to inspect/change.
    if (Array.isArray(USED_FILTERS.api.status) && USED_FILTERS.api.status.length > 0) {
      params.push(`status=${USED_FILTERS.api.status.join(',')}`);
    }

    // Optional area/state filter (e.g. CA, KS)
    if (area) {
      params.push(`area=${encodeURIComponent(area)}`);
    }

    const query = params.length ? `?${params.join('&')}` : '';
    const pathWithQuery = `${CONFIG.endpoint}${query}`;

    const outputFile = area
      ? `active-alerts-${area.toUpperCase()}.json`
      : 'active-alerts.json';

    console.log('Fetching active NWS alerts...');
    console.log(`API: https://${CONFIG.baseUrl}${pathWithQuery}`);

    const data = await fetchJson(pathWithQuery);

    const features = Array.isArray(data.features) ? data.features : [];
    
    // Client-side filters (from USED_FILTERS and DAMAGE_EVENT_CONFIG):
    // 1. Severity/certainty gates
    const allowedSeverities = new Set(
      (USED_FILTERS.client.severity || []).map((s) => String(s).toLowerCase())
    );
    const allowedCertainties = new Set(
      (USED_FILTERS.client.certainty || []).map((c) => String(c).toLowerCase())
    );
    
    // 2. Property-damage-relevant event types
    const allowedEvents = new Set(
      (DAMAGE_EVENT_CONFIG.primaryUsed || []).map((e) => String(e).toLowerCase())
    );

    const filteredFeatures = features.filter((feature) => {
      const props = feature && feature.properties ? feature.properties : {};
      const severity = typeof props.severity === 'string' ? props.severity.toLowerCase() : '';
      const certainty = typeof props.certainty === 'string' ? props.certainty.toLowerCase() : '';
      const event = typeof props.event === 'string' ? props.event.toLowerCase() : '';
      
      return (
        allowedSeverities.has(severity) &&
        allowedCertainties.has(certainty) &&
        allowedEvents.has(event)
      );
    });

    const filteredData = {
      ...data,
      features: filteredFeatures,
    };

    const outputPath = path.join(__dirname, outputFile);
    await fs.writeFile(outputPath, JSON.stringify(filteredData, null, 2), 'utf8');

    const totalCount = features.length;
    const filteredCount = filteredFeatures.length;

    console.log(`\n✓ Saved active alerts to ${outputPath}`);
    console.log(`  Total alerts returned (status=actual): ${totalCount}`);
    console.log(`  Alerts after severity/certainty/event filter: ${filteredCount}`);
    
    // Optional debug: show which event types appeared but are not in primaryUsed
    if (process.env.DEBUG_EVENTS) {
      const seenEvents = new Set();
      features.forEach((feature) => {
        const event = feature?.properties?.event;
        if (event && typeof event === 'string') {
          seenEvents.add(event);
        }
      });
      
      const unusedEvents = Array.from(seenEvents).filter(
        (evt) => !allowedEvents.has(evt.toLowerCase())
      );
      
      if (unusedEvents.length > 0) {
        console.log(`\n  Debug: Event types seen but not in DAMAGE_EVENT_CONFIG.primaryUsed:`);
        unusedEvents.sort().forEach((evt) => console.log(`    - ${evt}`));
      }
    }
  } catch (error) {
    console.error('\n✗ Error fetching active alerts:');
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


