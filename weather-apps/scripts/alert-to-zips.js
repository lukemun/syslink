#!/usr/bin/env node

/**
 * Core lookup helpers to translate NWS SAME codes to ZIP codes.
 *
 * Data sources (pre-built by build-lookups.js):
 *  - data/processed/fips-to-county.json
 *  - data/processed/fips-to-zips.json
 *  - data/processed/zip-to-fips.json
 *
 * Optional refinement data:
 *  - data/processed/zip-centroids.json (if available, used for polygon filtering)
 *
 * Typical usage (from another module):
 *
 *   import { sameCodesToZips, alertToZips } from './alert-to-zips.js';
 *
 *   const { zips } = sameCodesToZips(['06037']); // Los Angeles County
 *
 *   const enriched = alertToZips(alertFeature, {
 *     residentialRatioThreshold: 0.8,  // Option 1: only ZIPs mostly in-county
 *     geometry: alertFeature.geometry, // Option 3: polygon refinement when present
 *   });
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROCESSED_DIR = path.join(__dirname, 'data', 'processed');

function readJSON(filename, optional = false) {
  try {
    const content = fs.readFileSync(path.join(PROCESSED_DIR, filename), 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (optional && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

const LOOKUPS = {
  fipsToCounty: readJSON('fips-to-county.json'),
  fipsToZips: readJSON('fips-to-zips.json'),
  zipToFips: readJSON('zip-to-fips.json'),
  zipCentroids: readJSON('zip-centroids.json', true), // optional
};

function normalizeFips(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  if (trimmed.length === 6 && trimmed.startsWith('0')) {
    return trimmed.slice(1);
  }
  return trimmed.padStart(5, '0');
}

function normalizeZip(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  return trimmed.padStart(5, '0');
}

export function getCountyInfo(fipsCode) {
  const normalized = normalizeFips(fipsCode);
  if (!normalized) {
    return null;
  }
  return LOOKUPS.fipsToCounty[normalized] || null;
}

function pointInPolygon(point, polygon) {
  // ray casting algorithm
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lon <
        ((xj - xi) * (point.lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function geometryContainsZip(zip, geometry) {
  if (!geometry || !LOOKUPS.zipCentroids) return true;
  const centroid = LOOKUPS.zipCentroids[zip];
  if (!centroid) return false;

  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];

  if (polygons.length === 0) return true;

  return polygons.some(rings => {
    const outerRing = rings[0];
    return pointInPolygon(
      { lat: centroid.lat, lon: centroid.lon },
      outerRing
    );
  });
}

/**
 * Convert SAME (FIPS) codes to ZIP codes.
 *
 * @param {string[]} sameCodes
 * @param {Object} options
 * @param {number} options.residentialRatioThreshold - Optional ratio filter (Option 1)
 * @param {Object} options.geometry - Optional GeoJSON geometry from alert
 * @returns {{
 *   zips: string[],
 *   zipDetails: Record<string, { zip: string, counties: Array<{ fips: string, residentialRatio: number }> }>,
 *   counties: Array<{ fips: string, county: string|null, state: string|null, zipCount: number }>
 * }}
 */
export function sameCodesToZips(sameCodes = [], options = {}) {
  const { residentialRatioThreshold = 0, geometry } = options;
  const uniqueZipDetails = new Map();
  const counties = [];

  for (const code of sameCodes) {
    const fips = normalizeFips(code);
    if (!fips) continue;
    const countyInfo = getCountyInfo(fips);
    const zipEntries = (LOOKUPS.fipsToZips[fips] || []).filter(
      entry => entry.residentialRatio >= residentialRatioThreshold
    );

    counties.push({
      fips,
      county: countyInfo?.county ?? null,
      state: countyInfo?.state ?? null,
      zipCount: zipEntries.length,
    });

    for (const entry of zipEntries) {
      if (geometry && !geometryContainsZip(entry.zip, geometry)) {
        continue;
      }

      if (!uniqueZipDetails.has(entry.zip)) {
        uniqueZipDetails.set(entry.zip, {
          zip: entry.zip,
          counties: [],
        });
      }
      uniqueZipDetails.get(entry.zip).counties.push({
        fips,
        residentialRatio: entry.residentialRatio,
        totalRatio: entry.totalRatio,
      });
    }
  }

  const zipDetailsObject = Object.fromEntries(uniqueZipDetails);

  return {
    zips: Object.keys(zipDetailsObject),
    zipDetails: zipDetailsObject,
    counties,
  };
}

/**
 * Translate a complete NWS alert object into affected ZIP codes.
 *
 * @param {Object} alert - Feature element from api.weather.gov alerts feed
 * @param {Object} options - forwarded to sameCodesToZips
 */
export function alertToZips(alert, options = {}) {
  const properties = alert?.properties ?? {};
  const sameCodes = properties.geocode?.SAME ?? [];
  const result = sameCodesToZips(sameCodes, {
    ...options,
    geometry: alert?.geometry ?? options.geometry,
  });
  return {
    alertId: properties.id,
    event: properties.event,
    severity: properties.severity,
    urgency: properties.urgency,
    certainty: properties.certainty,
    ...result,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // simple CLI usage for debugging
  const sampleCodes = process.argv.slice(2);
  const result = sameCodesToZips(sampleCodes);
  console.log(JSON.stringify(result, null, 2));
}


