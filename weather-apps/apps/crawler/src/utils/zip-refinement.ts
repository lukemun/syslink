/**
 * ZIP refinement utilities for experimental alert-to-ZIP mapping strategies.
 * 
 * Purpose:
 *   Provide city-based filtering and logging helpers for ZIP refinement experiments.
 *   These functions support logging-only comparisons between county-based, polygon-based,
 *   and city-based ZIP filtering strategies.
 * 
 * Usage:
 *   Import from ingest.ts when ZIP_REFINEMENT_DEBUG=1 to compute and log experimental
 *   ZIP sets without affecting production database writes.
 */

import zipToCityJson from '../data/processed/zip-to-city.json' with { type: 'json' };

interface ZipCityInfo {
  city: string;
  state: string;
  county_fips: string;
}

const ZIP_TO_CITY = zipToCityJson as Record<string, ZipCityInfo>;

/**
 * Normalize a city name for case-insensitive matching.
 * Lowercases, trims, and removes common punctuation.
 */
export function normalizeCityName(city: string): string {
  return city
    .toLowerCase()
    .trim()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Extract city names from alert description text.
 * 
 * Strategy:
 *   1. Extract sequences of capitalized words (potential city names)
 *   2. Filter out common non-city words (months, days, directions, etc.)
 *   3. Validate against known cities from zip-to-city.json
 * 
 * Returns a set of normalized city names that exist in our city database.
 */
export function extractCitiesFromDescription(description: string): Set<string> {
  const cities = new Set<string>();
  
  if (!description) return cities;
  
  // Build a set of known cities from our ZIP database (only on first call)
  if (!knownCities) {
    knownCities = new Set<string>();
    for (const zipInfo of Object.values(ZIP_TO_CITY)) {
      knownCities.add(normalizeCityName(zipInfo.city));
    }
  }
  
  // Extract sequences of 1-3 capitalized words (potential city names)
  const pattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
  const matches = description.matchAll(pattern);
  
  for (const match of matches) {
    const candidate = match[1];
    
    // Skip common non-city words
    if (SKIP_WORDS.has(candidate)) {
      continue;
    }
    
    // Normalize and check if it's a known city
    const normalized = normalizeCityName(candidate);
    if (knownCities.has(normalized)) {
      cities.add(normalized);
    }
  }
  
  return cities;
}

// Cache of known cities (built lazily on first use)
let knownCities: Set<string> | null = null;

// Words to skip when extracting city names (not exhaustive, but covers common cases)
const SKIP_WORDS = new Set([
  // Articles, prepositions, conjunctions
  'The', 'In', 'For', 'Including', 'At', 'By', 'Of', 'To', 'From', 'With',
  'And', 'Or', 'But', 'Near', 'Between', 'Along', 'Through', 'Until',
  
  // Months
  'January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December',
  
  // Days of week
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  
  // Common NWS alert terms
  'National', 'Weather', 'Service', 'Warning', 'Watch', 'Advisory', 'Statement',
  'Forecast', 'Issued', 'Continues', 'Expires', 'Effective', 'Until', 'Through',
  'This', 'That', 'Some', 'All', 'Other', 'More', 'Less', 'Most',
  
  // Directions and locations
  'North', 'South', 'East', 'West', 'Northeast', 'Northwest', 'Southeast', 'Southwest',
  'Northern', 'Southern', 'Eastern', 'Western', 'Central', 'Upper', 'Lower', 'Middle',
  'Across', 'Above', 'Below', 'Around', 'Beyond',
  
  // Weather phenomena
  'Flash', 'Flood', 'Storm', 'Tornado', 'Hurricane', 'Winter', 'Ice', 'Snow',
  'Wind', 'Fire', 'Heat', 'Cold', 'Freeze', 'Frost', 'Fog', 'Smoke',
  'Thunderstorms', 'Lightning', 'Rain', 'Hail', 'Blizzard', 'Drought',
  
  // Geographic features
  'County', 'Counties', 'River', 'Lake', 'Mountain', 'Valley', 'Creek', 'Bay',
  'Island', 'Coast', 'Beach', 'Highway', 'Road', 'Street', 'Avenue',
  
  // Time references
  'Today', 'Tonight', 'Tomorrow', 'Morning', 'Afternoon', 'Evening', 'Night',
  'Midnight', 'Noon', 'Dawn', 'Dusk',
  
  // Measurement/description
  'Severe', 'Extreme', 'High', 'Low', 'Heavy', 'Light', 'Moderate',
  'Strong', 'Weak', 'Major', 'Minor', 'Additional', 'Possible', 'Likely',
  
  // Common alert phrases
  'Life', 'Threatening', 'Dangerous', 'Immediate', 'Emergency', 'Take', 'Shelter',
  'Move', 'Higher', 'Ground', 'Avoid', 'Area', 'Areas', 'Residents', 'People',
]);

/**
 * Filter ZIPs by city names extracted from alert description.
 * 
 * For each ZIP in countyZips, keep it if:
 *   1. The ZIP exists in our city lookup
 *   2. Its city (normalized) matches one of the parsed city names
 *   3. (Optional) If alertState is provided, the state must match
 * 
 * This is strictly for logging/experimental purposes and does not affect
 * production ZIP mappings written to the database.
 */
export function filterZipsByCities(
  countyZips: string[],
  parsedCities: Set<string>,
  alertState?: string
): string[] {
  if (parsedCities.size === 0) {
    return []; // No cities to filter by
  }
  
  const filtered: string[] = [];
  
  for (const zip of countyZips) {
    const cityInfo = ZIP_TO_CITY[zip];
    if (!cityInfo) continue;
    
    const normalizedCity = normalizeCityName(cityInfo.city);
    
    // Check if city matches
    if (!parsedCities.has(normalizedCity)) continue;
    
    // Check if state matches (if provided)
    if (alertState && cityInfo.state.toLowerCase() !== alertState.toLowerCase()) {
      continue;
    }
    
    filtered.push(zip);
  }
  
  return filtered;
}

/**
 * Compute statistics about different ZIP filtering strategies.
 * 
 * Returns an object with counts and set relationships for logging.
 */
export function computeZipSetStats(
  allCountyZips: string[],
  polygonZips: string[],
  cityZips: string[]
): {
  countyCount: number;
  polygonCount: number;
  cityCount: number;
  polygonOnlyCount: number;
  cityOnlyCount: number;
  intersectionCount: number;
  unionCount: number;
} {
  const countySet = new Set(allCountyZips);
  const polygonSet = new Set(polygonZips);
  const citySet = new Set(cityZips);
  
  const intersection = new Set<string>();
  const union = new Set<string>();
  
  // Calculate intersection and union of polygon and city
  for (const zip of polygonZips) {
    union.add(zip);
    if (citySet.has(zip)) {
      intersection.add(zip);
    }
  }
  for (const zip of cityZips) {
    union.add(zip);
  }
  
  const polygonOnly = polygonZips.filter(z => !citySet.has(z));
  const cityOnly = cityZips.filter(z => !polygonSet.has(z));
  
  return {
    countyCount: allCountyZips.length,
    polygonCount: polygonZips.length,
    cityCount: cityZips.length,
    polygonOnlyCount: polygonOnly.length,
    cityOnlyCount: cityOnly.length,
    intersectionCount: intersection.size,
    unionCount: union.size,
  };
}

/**
 * Log ZIP refinement experiment results for a single alert.
 * 
 * Displays counts, percentages, and sample ZIPs for comparison.
 */
export function logZipRefinement(
  alertId: string,
  event: string,
  stats: ReturnType<typeof computeZipSetStats>,
  allCountyZips: string[],
  polygonZips: string[],
  cityZips: string[],
  parsedCities: Set<string>
): void {
  console.log('\n=== ZIP Refinement Experiment ===');
  console.log(`Alert: ${alertId.substring(alertId.length - 40)}`);
  console.log(`Event: ${event}`);
  console.log(`Parsed cities: ${Array.from(parsedCities).join(', ') || '(none)'}`);
  console.log('');
  console.log('Strategy Comparison:');
  console.log(`  County-based (baseline):  ${stats.countyCount} ZIPs`);
  console.log(`  Polygon-filtered:         ${stats.polygonCount} ZIPs (${stats.countyCount > 0 ? Math.round((stats.polygonCount / stats.countyCount) * 100) : 0}% of baseline)`);
  console.log(`  City-filtered:            ${stats.cityCount} ZIPs (${stats.countyCount > 0 ? Math.round((stats.cityCount / stats.countyCount) * 100) : 0}% of baseline)`);
  console.log('');
  console.log('Set Relationships:');
  console.log(`  Polygon ∩ City:           ${stats.intersectionCount} ZIPs (high-confidence core)`);
  console.log(`  Polygon ∪ City:           ${stats.unionCount} ZIPs`);
  console.log(`  Polygon only:             ${stats.polygonOnlyCount} ZIPs`);
  console.log(`  City only:                ${stats.cityOnlyCount} ZIPs`);
  console.log('');
  console.log('Sample ZIPs:');
  console.log(`  County (first 10):        ${allCountyZips.slice(0, 10).join(', ')}${allCountyZips.length > 10 ? '...' : ''}`);
  console.log(`  Polygon (first 10):       ${polygonZips.slice(0, 10).join(', ') || '(none)'}${polygonZips.length > 10 ? '...' : ''}`);
  console.log(`  City (first 10):          ${cityZips.slice(0, 10).join(', ') || '(none)'}${cityZips.length > 10 ? '...' : ''}`);
  console.log('=== End ZIP Refinement ===\n');
}

