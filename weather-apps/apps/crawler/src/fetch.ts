/**
 * Fetch currently active NWS alerts as GeoJSON.
 *
 * Uses the National Weather Service /alerts/active endpoint to retrieve
 * all currently active alerts that match specific status, severity, certainty,
 * and event-type filters.
 *
 * Usage:
 *   import { fetchAlerts } from './fetch.js';
 *   const data = await fetchAlerts();
 */

import https from 'https';
import { USED_FILTERS, DAMAGE_EVENT_CONFIG } from './config.js';

const CONFIG = {
  baseUrl: 'api.weather.gov',
  endpoint: '/alerts/active',
  userAgent: '(syslink-weather-alerts, contact@example.com)',
};

interface AlertData {
  features: any[];
  [key: string]: any;
}

/**
 * Perform a GET request to the NWS API and parse JSON.
 */
async function fetchJson(endpointPath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: CONFIG.baseUrl,
      path: endpointPath,
      method: 'GET',
      headers: {
        'User-Agent': CONFIG.userAgent,
        'Accept': 'application/geo+json',
      },
      // For local testing only - disable SSL verification if NODE_TLS_REJECT_UNAUTHORIZED=0
      rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
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
        } catch (err: any) {
          reject(new Error(`Failed to parse JSON: ${err.message}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

/**
 * Fetch active alerts and return filtered GeoJSON data.
 * @param area - Optional state/area code (e.g. CA, KS)
 * @returns Promise that resolves to filtered alert data
 */
export async function fetchAlerts(area?: string): Promise<AlertData> {
  const params: string[] = [];

  // Server-side filters: status
  if (Array.isArray(USED_FILTERS.api.status) && USED_FILTERS.api.status.length > 0) {
    params.push(`status=${USED_FILTERS.api.status.join(',')}`);
  }

  // Optional area/state filter
  if (area) {
    params.push(`area=${encodeURIComponent(area)}`);
  }

  const query = params.length ? `?${params.join('&')}` : '';
  const pathWithQuery = `${CONFIG.endpoint}${query}`;

  console.log('Fetching active NWS alerts...');
  console.log(`API: https://${CONFIG.baseUrl}${pathWithQuery}`);

  const data = await fetchJson(pathWithQuery);

  const features = Array.isArray(data.features) ? data.features : [];
  
  // Client-side filters
  const allowedSeverities = new Set(
    (USED_FILTERS.client.severity || []).map((s) => String(s).toLowerCase())
  );
  const allowedCertainties = new Set(
    (USED_FILTERS.client.certainty || []).map((c) => String(c).toLowerCase())
  );
  
  const allowedEvents = new Set(
    (DAMAGE_EVENT_CONFIG.primaryUsed || []).map((e) => String(e).toLowerCase())
  );

  const filteredFeatures = features.filter((feature: any) => {
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

  console.log(`Total alerts returned (status=actual): ${features.length}`);
  console.log(`Alerts after severity/certainty/event filter: ${filteredFeatures.length}`);

  return {
    ...data,
    features: filteredFeatures,
  };
}

