#!/usr/bin/env node

/**
 * Build geo lookup tables from Census and HUD datasets.
 *
 * Output files (stored in weather-alerts/data/processed/):
 *  - fips-to-county.json
 *  - fips-to-zips.json
 *  - zip-to-fips.json
 *
 * Usage:
 *   node weather-alerts/build-lookups.js
 *
 * Prerequisites:
 *   - weather-alerts/data/raw/national_county.txt
 *   - A HUD ZIP-COUNTY export (CSV/XLSX) in weather-alerts/data/raw/
 *     e.g. ZIP_COUNTY_062025__Export_Worksheet.csv
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import xlsx from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAW_DIR = path.join(__dirname, 'data', 'raw');
const PROCESSED_DIR = path.join(__dirname, 'data', 'processed');

const OUTPUT_FILES = {
  county: path.join(PROCESSED_DIR, 'fips-to-county.json'),
  fipsToZips: path.join(PROCESSED_DIR, 'fips-to-zips.json'),
  zipToFips: path.join(PROCESSED_DIR, 'zip-to-fips.json'),
};

async function ensureProcessedDir() {
  await fs.mkdir(PROCESSED_DIR, { recursive: true });
}

function padZip(value) {
  if (typeof value === 'number') {
    return String(value).padStart(5, '0');
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.padStart(5, '0');
  }
  return null;
}

function padFips(value) {
  if (typeof value === 'number') {
    return String(value).padStart(5, '0');
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.padStart(5, '0');
  }
  return null;
}

async function readFipsFile() {
  const filePath = path.join(RAW_DIR, 'national_county.txt');
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.trim().split('\n');
  const map = {};

  for (const line of lines) {
    const [stateAbbr, stateFipsRaw, countyFipsRaw, rawName] = line.split(',').map(part => part.trim());
    if (!stateAbbr || !stateFipsRaw || !countyFipsRaw) continue;
    const stateFips = stateFipsRaw.padStart(2, '0');
    const countyFips = countyFipsRaw.padStart(3, '0');
    const fips = `${stateFips}${countyFips}`;
    const countyName = rawName.replace(/ County$/i, '');
    map[fips] = {
      state: stateAbbr,
      county: countyName,
      stateFips,
      countyFips,
    };
  }

  return map;
}

async function findZipCountyFile() {
  const files = await fs.readdir(RAW_DIR);
  const candidates = files
    .filter(name => /^ZIP_COUNTY/i.test(name) && !/^ZIP_COUNTY_SUB/i.test(name))
    .map(name => {
      const upper = name.toUpperCase();
      const ext = path.extname(name).toLowerCase();
      const isExport = upper.includes('EXPORT');
      const priority =
        (isExport ? 0 : 2) +
        (ext === '.xlsx' ? 1 : 0); // prefer CSV export, then XLSX export, then others
      return { name, priority };
    })
    .sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return b.name.localeCompare(a.name);
    });

  if (candidates.length === 0) {
    throw new Error('No ZIP_COUNTY files found in data/raw/.');
  }

  return path.join(RAW_DIR, candidates[0].name);
}

function readZipCountyRows(filePath) {
  const workbook = xlsx.readFile(filePath, { cellDates: false });
  const [firstSheetName] = workbook.SheetNames;
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = xlsx.utils.sheet_to_json(worksheet, { defval: null });
  return rows.map(row => ({
    zip: padZip(row.ZIP ?? row.Zip ?? row.zip),
    county: padFips(row.COUNTY ?? row.County ?? row.county),
    resRatio: Number(row.RES_RATIO ?? row.Res_Ratio ?? row.RES ?? row.res_ratio ?? 0) || 0,
    busRatio: Number(row.BUS_RATIO ?? row.Bus_Ratio ?? row.bus_ratio ?? 0) || 0,
    othRatio: Number(row.OTH_RATIO ?? row.Oth_Ratio ?? row.oth_ratio ?? 0) || 0,
    totRatio: Number(row.TOT_RATIO ?? row.Total_Ratio ?? row.tot_ratio ?? 0) || 0,
    city: row.USPS_ZIP_PREF_CITY ?? row.City ?? null,
    state: row.USPS_ZIP_PREF_STATE ?? row.State ?? null,
  })).filter(entry => entry.zip && entry.county);
}

async function buildLookups() {
  await ensureProcessedDir();
  const fipsMap = await readFipsFile();
  const zipCountyFile = await findZipCountyFile();
  console.log(`Using ZIP-COUNTY file: ${zipCountyFile}`);
  const rows = readZipCountyRows(zipCountyFile);

  const fipsToZips = {};
  const zipToFips = {};

  for (const row of rows) {
    const entry = {
      zip: row.zip,
      fips: row.county,
      residentialRatio: row.resRatio,
      businessRatio: row.busRatio,
      otherRatio: row.othRatio,
      totalRatio: row.totRatio,
    };

    if (!fipsToZips[row.county]) {
      fipsToZips[row.county] = [];
    }
    fipsToZips[row.county].push(entry);

    if (!zipToFips[row.zip]) {
      zipToFips[row.zip] = [];
    }
    zipToFips[row.zip].push(entry);
  }

  const meta = {
    totalFips: Object.keys(fipsMap).length,
    totalZipCountyPairs: rows.length,
    totalUniqueZips: Object.keys(zipToFips).length,
  };

  console.log(`Counties in FIPS map: ${meta.totalFips}`);
  console.log(`ZIP→County pairs: ${meta.totalZipCountyPairs}`);
  console.log(`Unique ZIPs: ${meta.totalUniqueZips}`);

  await fs.writeFile(OUTPUT_FILES.county, JSON.stringify(fipsMap, null, 2));
  await fs.writeFile(OUTPUT_FILES.fipsToZips, JSON.stringify(fipsToZips, null, 2));
  await fs.writeFile(OUTPUT_FILES.zipToFips, JSON.stringify(zipToFips, null, 2));

  console.log('Lookup tables written to data/processed/.');
}

async function main() {
  try {
    await buildLookups();
  } catch (error) {
    console.error('✗ Failed to build lookups:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}


