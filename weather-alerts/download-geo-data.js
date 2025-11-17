#!/usr/bin/env node

/**
 * Download nationwide geo reference data required to translate
 * weather alerts (SAME/FIPS codes) into ZIP codes.
 *
 * Files downloaded (into weather-alerts/data/raw/):
 *  - HUD USPS ZIP-County Crosswalk (Excel)  [optional: requires HUD login]
 *  - Census Bureau National County FIPS list (CSV)
 *
 * Usage:
 *   node weather-alerts/download-geo-data.js
 *   HUD_CROSSWALK_VERSION=062025 node weather-alerts/download-geo-data.js
 *
 * Notes:
 *   - If the HUD crosswalk cannot be fetched directly, download it manually
 *     from the HUD portal and place it in weather-alerts/data/raw/.
 *   - Existing files are detected and skipped.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAW_DATA_DIR = path.join(__dirname, 'data', 'raw');

const HUD_DEFAULT_VERSION = '122023'; // December 2023 release

const HUD_VERSION =
  process.env.HUD_CROSSWALK_VERSION ||
  process.argv.find(arg => arg.startsWith('--hud='))?.split('=')[1] ||
  HUD_DEFAULT_VERSION;

const HUD_FILENAME = `ZIP_COUNTY_${HUD_VERSION}.xlsx`;
const HUD_URL = `https://www.huduser.gov/portal/datasets/usps/${HUD_FILENAME}`;

const CENSUS_FILENAME = 'national_county.txt';
const CENSUS_URL =
  'https://www2.census.gov/geo/docs/reference/codes/files/national_county.txt';

const DOWNLOADS = [
  {
    name: 'HUD ZIP-County Crosswalk (requires HUD login session)',
    filename: HUD_FILENAME,
    url: HUD_URL,
    optional: true, // portal now requires auth – allow manual download
    instructions:
      'Download manually from https://www.huduser.gov/portal/datasets/usps_crosswalk.html after logging in, then place the file in weather-alerts/data/raw/',
  },
  {
    name: 'Census National County FIPS',
    filename: CENSUS_FILENAME,
    url: CENSUS_URL,
  },
];

async function ensureRawDir() {
  await fs.mkdir(RAW_DATA_DIR, { recursive: true });
}

async function downloadFile({ name, filename, url, optional, instructions }) {
  const destination = path.join(RAW_DATA_DIR, filename);
  try {
    await fs.access(destination);
    console.log(`\n⏭️  ${name} already exists, skipping.`);
    return;
  } catch {
    // file missing, continue
  }

  console.log(`\n⬇️  ${name}`);
  console.log(`    URL:  ${url}`);
  console.log(`    Dest: ${destination}`);

  const response = await fetch(url);
  if (!response.ok) {
    const message = `Failed to download ${name}: HTTP ${response.status}`;
    if (optional) {
      console.warn(`    ⚠️  ${message}`);
      if (instructions) {
        console.warn(`    ↪︎ ${instructions}`);
      }
      return;
    }
    throw new Error(message);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, buffer);
  console.log(`    ✓ Saved (${buffer.length.toLocaleString()} bytes)`);
}

async function main() {
  try {
    console.log('Downloading geo reference data...');
    await ensureRawDir();
    for (const file of DOWNLOADS) {
      try {
        await downloadFile(file);
      } catch (error) {
        console.error(`    ✗ ${file.name}: ${error.message}`);
        if (!file.optional) {
          throw error;
        }
      }
    }
    console.log('\nAll files downloaded successfully.');
    console.log(`Stored in: ${RAW_DATA_DIR}`);
    console.log(
      '\nTip: set HUD_CROSSWALK_VERSION or pass --hud=MMYYYY to fetch a different quarter.'
    );
  } catch (error) {
    console.error('\n✗ Download failed:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}


