#!/usr/bin/env node
/**
 * Import Census Income Data to Supabase
 * 
 * Purpose: Reads the processed ACS income CSV and imports it into the census_income_by_zip
 * Supabase table for use in lead enrichment and scoring.
 * 
 * Usage:
 *   node nextjs/scripts/import-census-data.js
 * 
 * Environment variables required:
 *   SUPABASE_URL - Your Supabase project URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_KEY - Service role key (for admin access)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
const rootEnvPath = resolve(__dirname, '../../.env');
try {
  const envContent = readFileSync(rootEnvPath, 'utf-8');
  let loadedCount = 0;
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').replace(/^["']|["']$/g, ''); // Remove quotes
        process.env[key.trim()] = value.trim();
        loadedCount++;
      }
    }
  });
  console.log(`✓ Loaded ${loadedCount} environment variables from .env`);
} catch (err) {
  console.log(`ℹ No .env file found at ${rootEnvPath}, using existing environment variables`);
  console.log(`   Error: ${err.message}`);
}

// Input CSV (use the enhanced wealth dataset)
const CSV_PATH = resolve(__dirname, '../../census-acs-income-2023/processed/wealth_by_zip_enhanced.csv');

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY 
  || process.env.SUPABASE_SERVICE_ROLE_KEY 
  || process.env.SERVICE_ROLE_KEY
  || process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL):', SUPABASE_URL ? '✓' : '✗');
  console.error('   Service Key (SUPABASE_SERVICE_KEY, SUPABASE_SERVICE_ROLE_KEY, SERVICE_ROLE_KEY, or SUPABASE_SECRET_KEY):', SUPABASE_SERVICE_KEY ? '✓' : '✗');
  console.error('');
  console.error('Available env vars starting with SUPABASE_:');
  Object.keys(process.env)
    .filter(key => key.startsWith('SUPABASE_') || key.includes('SERVICE'))
    .forEach(key => {
      const value = process.env[key];
      const preview = value ? `${value.substring(0, 20)}...` : '(empty)';
      console.error(`   ${key}: ${preview}`);
    });
  process.exit(1);
}

// Create Supabase client with service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Parse CSV file into objects
 */
function parseCSV(csvContent) {
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',');
  
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const row = {};
    
    headers.forEach((header, index) => {
      const value = values[index];
      row[header] = value;
    });
    
    // Normalize ZIP to 5 digits (pad with leading zeros)
    const zip = row.zip.toString().padStart(5, '0');
    
    // Convert numeric fields
    const parsedRow = {
      zip,
      total_households: parseInt(row.total_households) || 0,
      mean_household_income: parseInt(row.mean_household_income) || 0,
      median_household_income: parseInt(row.median_household_income) || 0,
      per_capita_income: parseInt(row.per_capita_income) || 0,
      mean_earnings: parseInt(row.mean_earnings) || 0,
      hh_income_200k_plus: parseInt(row.hh_income_200k_plus) || 0,
      pct_people_poverty: parseFloat(row.pct_people_poverty) || 0,
      median_earnings_workers: parseInt(row.median_earnings_workers) || 0,
      pct_wealthy_households: parseFloat(row.pct_wealthy_households) || 0,
    };
    
    rows.push(parsedRow);
  }
  
  return rows;
}

/**
 * Transform census row to Supabase schema
 */
function transformToSupabaseRow(censusRow) {
  return {
    zip: censusRow.zip,
    name: `ZCTA5 ${censusRow.zip}`,
    state: null,
    county_name: null,
    total_households: censusRow.total_households || null,
    median_household_income: censusRow.median_household_income || null,
    mean_household_income: censusRow.mean_household_income || null,
    per_capita_income: censusRow.per_capita_income || null,
    hh_income_under_10k: null,
    hh_income_10k_15k: null,
    hh_income_15k_25k: null,
    hh_income_25k_35k: null,
    hh_income_35k_50k: null,
    hh_income_50k_75k: null,
    hh_income_75k_100k: null,
    hh_income_100k_150k: null,
    hh_income_150k_200k: null,
    hh_income_200k_plus: censusRow.hh_income_200k_plus || null,
    pct_people_poverty: censusRow.pct_people_poverty || null,
    pct_families_poverty: null,
    median_earnings_workers: censusRow.median_earnings_workers || null,
    mean_earnings: censusRow.mean_earnings || null,
    pct_wealthy_households: censusRow.pct_wealthy_households || null,
    year: 2023,
  };
}

/**
 * Import data in batches
 */
async function importData(rows, batchSize = 500) {
  console.log(`📦 Importing ${rows.length} rows in batches of ${batchSize}...`);
  
  let imported = 0;
  let errors = 0;
  
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(rows.length / batchSize);
    
    try {
      const { data, error } = await supabase
        .from('census_income_by_zip')
        .upsert(batch, { onConflict: 'zip' });
      
      if (error) {
        console.error(`❌ Batch ${batchNum}/${totalBatches} failed:`, error.message);
        errors += batch.length;
      } else {
        imported += batch.length;
        console.log(`✓ Batch ${batchNum}/${totalBatches} imported (${imported}/${rows.length} total)`);
      }
    } catch (err) {
      console.error(`❌ Batch ${batchNum}/${totalBatches} exception:`, err);
      errors += batch.length;
    }
  }
  
  return { imported, errors };
}

/**
 * Main import function
 */
async function main() {
  console.log('='.repeat(70));
  console.log('IMPORT CENSUS INCOME DATA TO SUPABASE');
  console.log('='.repeat(70));
  console.log();
  
  // Read CSV file
  console.log(`📖 Reading CSV: ${CSV_PATH}`);
  let csvContent;
  try {
    csvContent = readFileSync(CSV_PATH, 'utf-8');
  } catch (err) {
    console.error(`❌ Failed to read CSV file: ${err.message}`);
    process.exit(1);
  }
  
  // Parse CSV
  console.log('🔍 Parsing CSV...');
  const censusRows = parseCSV(csvContent);
  console.log(`✓ Parsed ${censusRows.length} ZIP codes`);
  console.log();
  
  // Transform to Supabase schema
  console.log('🔄 Transforming data...');
  const supabaseRows = censusRows.map(transformToSupabaseRow);
  console.log(`✓ Transformed ${supabaseRows.length} rows`);
  console.log();
  
  // Show sample
  console.log('Sample row:');
  console.log(JSON.stringify(supabaseRows[0], null, 2));
  console.log();
  
  // Import to Supabase
  const { imported, errors } = await importData(supabaseRows);
  
  console.log();
  console.log('='.repeat(70));
  console.log('IMPORT COMPLETE');
  console.log('='.repeat(70));
  console.log(`✓ Successfully imported: ${imported} rows`);
  if (errors > 0) {
    console.log(`❌ Failed: ${errors} rows`);
  }
  console.log();
  
  // Verify import
  console.log('🔍 Verifying import...');
  const { count, error } = await supabase
    .from('census_income_by_zip')
    .select('*', { count: 'exact', head: true });
  
  if (error) {
    console.error(`❌ Verification failed: ${error.message}`);
  } else {
    console.log(`✓ Total rows in table: ${count}`);
  }
  
  console.log();
  console.log('='.repeat(70));
}

// Run the script
main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});

