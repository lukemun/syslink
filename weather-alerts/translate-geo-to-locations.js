#!/usr/bin/env node

/**
 * Translate Weather Alert Geo Data to Zip Codes and Counties
 * 
 * This script demonstrates multiple approaches to convert NWS alert geo data
 * (SAME codes, UGC codes, zone URLs) into usable location identifiers like
 * zip codes and county names.
 */

import https from 'https';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { alertToZips, sameCodesToZips } from './alert-to-zips.js';

const RES_RATIO_THRESHOLD =
  Number(process.env.RES_RATIO_THRESHOLD ?? '0') || 0;

/**
 * Fetches zone details from NWS API
 * @param {string} zoneUrl - NWS zone API URL
 * @returns {Promise<Object>} Zone metadata
 */
function fetchZoneDetails(zoneUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(zoneUrl);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: {
        'User-Agent': '(syslink-weather-alerts, contact@example.com)',
        'Accept': 'application/geo+json'
      }
    };

    https.get(options, (res) => {
      let data = '';

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

/**
 * Translates SAME codes to county information
 * @param {Array<string>} sameCodes - FIPS/SAME codes from alert
 * @returns {Array<Object>} County information
 */
function translateSAMECodes(sameCodes, options = {}) {
  return sameCodesToZips(sameCodes, options);
}

/**
 * Analyzes an alert and extracts all location information
 * @param {Object} alert - Alert feature from NWS API
 * @returns {Object} Extracted location data
 */
function analyzeAlertLocations(alert) {
  const props = alert.properties;
  const sameCodes = props.geocode?.SAME || [];
  const ugcCodes = props.geocode?.UGC || [];

  const translation = alertToZips(alert, {
    residentialRatioThreshold: RES_RATIO_THRESHOLD,
  });

  const counties = translation.counties.map(county => {
    const zipCodes = translation.zips.filter(zip =>
      translation.zipDetails[zip].counties.some(c => c.fips === county.fips)
    );
    return {
      ...county,
      county: county.county ?? 'Unknown',
      state: county.state ?? 'Unknown',
      zipCodes,
      zipCount: zipCodes.length,
    };
  });

  return {
    alertId: props.id,
    event: props.event,
    severity: props.severity,
    areaDescription: props.areaDesc,
    counties,
    ugcZones: ugcCodes,
    zoneUrls: props.affectedZones || [],
    affectedCounties: counties.map(c => c.county).filter(c => c && c !== 'Unknown'),
    totalZipCodes: translation.zips.length,
    uniqueZips: translation.zips,
    zipDetails: translation.zipDetails,
    filters: {
      residentialRatioThreshold: RES_RATIO_THRESHOLD,
      polygonRefinementEnabled: Boolean(alert.geometry),
    },
  };
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('Weather Alert Geo Data Translation\n');
    console.log('='.repeat(80));
    
    // Load the alerts file
    const alertsPath = path.join(__dirname, 'california-alerts.json');
    const alertsData = await fs.readFile(alertsPath, 'utf8');
    const alerts = JSON.parse(alertsData);
    
    console.log(`\nLoaded ${alerts.features.length} alerts from california-alerts.json\n`);
    
    // Analyze each alert
    const locationData = [];
    
    for (const alert of alerts.features) {
      const analysis = analyzeAlertLocations(alert);
      locationData.push(analysis);
      
      console.log(`\n📍 ${analysis.event} (${analysis.severity})`);
      console.log(`   Area: ${analysis.areaDescription}`);
      console.log(`   Counties: ${analysis.affectedCounties.join(', ') || 'None mapped'}`);
      console.log(`   Total Zip Codes: ${analysis.totalZipCodes}`);
      
      if (analysis.counties.length > 0) {
        console.log(`   County Details:`);
        analysis.counties.forEach(county => {
          if (county.county !== 'Unknown') {
            console.log(`     - ${county.county} County (FIPS: ${county.fips}): ${county.zipCount} zip codes`);
            if (county.zipCodes.length > 0) {
              console.log(`       Sample zips: ${county.zipCodes.slice(0, 5).join(', ')}${county.zipCodes.length > 5 ? '...' : ''}`);
            }
          } else {
            console.log(`     - Unknown county for FIPS: ${county.fips}`);
          }
        });
      }
      
      if (analysis.ugcZones.length > 0) {
        console.log(`   UGC Zones: ${analysis.ugcZones.join(', ')}`);
      }
    }
    
    // Save analysis
    const outputPath = path.join(__dirname, 'location-analysis.json');
    await fs.writeFile(
      outputPath,
      JSON.stringify(locationData, null, 2),
      'utf8'
    );
    
    console.log('\n' + '='.repeat(80));
    console.log(`\n✓ Location analysis saved to: ${outputPath}`);
    
    // Summary statistics
    const totalCounties = new Set();
    const totalZips = new Set();
    locationData.forEach(alert => {
      alert.affectedCounties.forEach(c => totalCounties.add(c));
      alert.uniqueZips.forEach(z => totalZips.add(z));
    });
    
    console.log('\n📊 Summary Statistics:');
    console.log(`   Total unique counties: ${totalCounties.size}`);
    console.log(`   Total unique zip codes: ${totalZips.size}`);
    console.log(`   All affected counties: ${Array.from(totalCounties).sort().join(', ')}`);
    
    console.log('\n💡 Data Sources for Production:');
    console.log('   1. FIPS Codes → Counties: Census Bureau FIPS database');
    console.log('      https://www.census.gov/geographies/reference-files/2020/demo/popest/2020-fips.html');
    console.log('   2. Counties → Zip Codes: HUD USPS Zip Code Crosswalk');
    console.log('      https://www.huduser.gov/portal/datasets/usps_crosswalk.html');
    console.log('   3. UGC Zones → Counties: NWS Zone API');
    console.log('      https://api.weather.gov/zones/forecast/{UGC}');
    console.log('   4. Polygon → Zip Codes: Point-in-polygon with ZCTA centroids');
    console.log('      https://www.census.gov/programs-surveys/geography/guidance/geo-areas/zctas.html');
    
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    process.exit(1);
  }
}

// Execute
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { translateSAMECodes, analyzeAlertLocations };

