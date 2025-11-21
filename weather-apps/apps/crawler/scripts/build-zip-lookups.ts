/**
 * Build ZIP lookup JSON files from uszips.csv
 * 
 * Purpose:
 *   Parse src/uszips.csv (source of truth for ZIP centroids and city mappings)
 *   and generate two JSON lookup files for use in alert ZIP refinement experiments.
 * 
 * Important: The lat/lon coordinates in uszips.csv are POPULATION-WEIGHTED centroids,
 * not pure geographic centers. This means they represent where people actually live
 * within the ZIP code, making them ideal for weather alert targeting.
 * 
 * Outputs:
 *   - src/data/processed/zip-centroids.json: { [zip]: { lat, lon } }
 *   - src/data/processed/zip-to-city.json: { [zip]: { city, state, county_fips } }
 * 
 * Usage:
 *   npm run build-zip-lookups
 *   (Run this whenever uszips.csv is updated)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ZipCentroid {
  lat: number;  // Population-weighted latitude (from uszips.csv)
  lon: number;  // Population-weighted longitude (from uszips.csv)
}

interface ZipCityInfo {
  city: string;
  state: string;
  county_fips: string;
}

function normalizeZip(zip: string): string {
  return zip.trim().padStart(5, '0');
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result;
}

async function buildZipLookups() {
  console.log('Building ZIP lookup files from uszips.csv...\n');
  
  const srcDir = path.resolve(__dirname, '../src');
  const inputPath = path.join(srcDir, 'uszips.csv');
  const outputDir = path.join(srcDir, 'data/processed');
  const centroidsPath = path.join(outputDir, 'zip-centroids.json');
  const cityPath = path.join(outputDir, 'zip-to-city.json');
  
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }
  
  const content = fs.readFileSync(inputPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    throw new Error('uszips.csv is empty');
  }
  
  // Parse header
  const header = parseCSVLine(lines[0]);
  const zipIdx = header.indexOf('zip');
  const latIdx = header.indexOf('lat');
  const lngIdx = header.indexOf('lng');
  const cityIdx = header.indexOf('city');
  const stateIdx = header.indexOf('state_id');
  const countyFipsIdx = header.indexOf('county_fips');
  
  if (zipIdx === -1 || latIdx === -1 || lngIdx === -1 || cityIdx === -1 || stateIdx === -1 || countyFipsIdx === -1) {
    throw new Error(`Missing required columns in header: ${header.join(', ')}`);
  }
  
  const centroids: Record<string, ZipCentroid> = {};
  const zipToCity: Record<string, ZipCityInfo> = {};
  
  let processedCount = 0;
  let skippedCount = 0;
  
  // Process data rows (skip header)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const cols = parseCSVLine(line);
    
    const rawZip = cols[zipIdx]?.trim();
    const rawLat = cols[latIdx]?.trim();
    const rawLng = cols[lngIdx]?.trim();
    const rawCity = cols[cityIdx]?.trim();
    const rawState = cols[stateIdx]?.trim();
    const rawCountyFips = cols[countyFipsIdx]?.trim();
    
    if (!rawZip || !rawLat || !rawLng || !rawCity || !rawState || !rawCountyFips) {
      skippedCount++;
      continue;
    }
    
    const zip = normalizeZip(rawZip);
    const lat = parseFloat(rawLat);
    const lon = parseFloat(rawLng);
    
    if (isNaN(lat) || isNaN(lon)) {
      skippedCount++;
      continue;
    }
    
    centroids[zip] = { lat, lon };
    zipToCity[zip] = {
      city: rawCity,
      state: rawState,
      county_fips: rawCountyFips,
    };
    
    processedCount++;
  }
  
  console.log(`Processed ${processedCount} ZIP codes`);
  console.log(`Skipped ${skippedCount} invalid/incomplete rows\n`);
  
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Write outputs with pretty formatting
  fs.writeFileSync(centroidsPath, JSON.stringify(centroids, null, 2), 'utf-8');
  console.log(`✓ Wrote ${Object.keys(centroids).length} entries to ${path.relative(process.cwd(), centroidsPath)}`);
  
  fs.writeFileSync(cityPath, JSON.stringify(zipToCity, null, 2), 'utf-8');
  console.log(`✓ Wrote ${Object.keys(zipToCity).length} entries to ${path.relative(process.cwd(), cityPath)}`);
  
  console.log('\nDone! Run this script again whenever uszips.csv is updated.');
}

buildZipLookups().catch(err => {
  console.error('Error building ZIP lookups:', err);
  process.exit(1);
});

