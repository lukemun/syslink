#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File paths
const CSV_FILE = path.join(__dirname, 'dealmachine-contacts-2025-11-13-112118.csv');
const OUTPUT_FILE = path.join(__dirname, 'contacts.json');
const CONTACTED_FILE = path.join(__dirname, 'contacted.json');

/**
 * Simple CSV parser that handles quoted fields
 */
function parseCSV(content) {
  const lines = content.split('\n');
  const headers = parseCSVLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const values = parseCSVLine(line);
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Parse a single CSV line, handling quoted fields with commas
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Add the last field
  result.push(current);

  return result;
}

/**
 * Extract phone numbers with metadata from a contact row
 */
function extractPhones(row) {
  const phones = [];

  for (let i = 1; i <= 3; i++) {
    const number = row[`phone_${i}`];
    if (number && number.trim()) {
      phones.push({
        number: number.trim(),
        type: row[`phone_${i}_type`] || '',
        do_not_call: row[`phone_${i}_do_not_call`] === 'DO NOT CALL',
        status: row[`phone_${i}_activity_status`] || '',
        carrier: row[`phone_${i}_carrier`] || '',
        usage_2_months: row[`phone_${i}_usage_2_months`] || '',
        usage_12_months: row[`phone_${i}_usage_12_months`] || ''
      });
    }
  }

  return phones;
}

/**
 * Extract email addresses from a contact row
 */
function extractEmails(row) {
  const emails = [];

  for (let i = 1; i <= 3; i++) {
    const email = row[`email_address_${i}`];
    if (email && email.trim()) {
      emails.push(email.trim());
    }
  }

  return emails;
}

/**
 * Convert CSV data to address-keyed JSON structure
 */
function convertToJSON(rows) {
  const addressMap = {};

  rows.forEach(row => {
    const propertyAddress = row.associated_property_address_full;
    if (!propertyAddress || !propertyAddress.trim()) return;

    // Initialize address entry if it doesn't exist
    if (!addressMap[propertyAddress]) {
      addressMap[propertyAddress] = {
        property_address: propertyAddress,
        estimated_value: row.estimated_value || '',
        equity_percent: row.equity_percent || '',
        equity_amount: row.equity_amount || '',
        mortgage_amount: row.mortgage_amount || '',
        mtg1_est_loan_balance: row.mtg1_est_loan_balance || '',
        mtg1_est_payment_amount: row.mtg1_est_payment_amount || '',
        lender_name: row.lender_name || '',
        dealmachine_url: row.dealmachine_url || '',
        contacts: []
      };
    }

    // Build contact name
    const nameParts = [
      row.first_name,
      row.last_name,
      row.middle_initial,
      row.generational_suffix
    ].filter(part => part && part.trim());
    const name = nameParts.join(' ');

    // Build mailing address
    const mailingParts = [
      row.primary_mailing_address,
      row.primary_mailing_city,
      row.primary_mailing_state,
      row.primary_mailing_zip
    ].filter(part => part && part.trim());
    const mailingAddress = mailingParts.join(', ');

    // Create contact object
    const contact = {
      contact_id: row.contact_id,
      name: name || 'Unknown',
      mailing_address: mailingAddress,
      emails: extractEmails(row),
      phones: extractPhones(row),
      flags: row.contact_flags || '',
      gender: row.gender || '',
      language: row.language_preference || '',
      occupation: row.occupation_group || '',
      business_owner: row.business_owner === 'BUSINESS OWNER'
    };

    addressMap[propertyAddress].contacts.push(contact);
  });

  return addressMap;
}

/**
 * Load or create the contacted tracking file
 * New format includes detailed call history per contact
 */
function loadContactedFile() {
  if (fs.existsSync(CONTACTED_FILE)) {
    try {
      const content = fs.readFileSync(CONTACTED_FILE, 'utf8');
      const data = JSON.parse(content);
      
      // Check if it's old format (boolean values) and convert
      const firstKey = Object.keys(data)[0];
      if (firstKey && typeof data[firstKey] === 'boolean') {
        console.warn('Warning: Converting old contacted.json format to new format');
        const converted = {};
        for (const [contactId, value] of Object.entries(data)) {
          if (value === true) {
            converted[contactId] = {
              attempts: [],
              status: 'reached', // Assume old "true" means reached
              lastAttempt: new Date().toISOString()
            };
          }
        }
        return converted;
      }
      
      return data;
    } catch (error) {
      console.warn('Warning: Could not parse contacted.json, creating new file');
      return {};
    }
  }
  return {};
}

/**
 * Main conversion function
 */
function main() {
  console.log('📞 DealMachine Contacts CSV to JSON Converter\n');

  // Check if CSV file exists
  if (!fs.existsSync(CSV_FILE)) {
    console.error(`Error: CSV file not found at ${CSV_FILE}`);
    process.exit(1);
  }

  // Read and parse CSV
  console.log('📄 Reading CSV file...');
  const csvContent = fs.readFileSync(CSV_FILE, 'utf8');
  const rows = parseCSV(csvContent);
  console.log(`✓ Parsed ${rows.length} contact rows`);

  // Convert to JSON structure
  console.log('\n🔄 Converting to JSON structure...');
  const addressMap = convertToJSON(rows);
  const addressCount = Object.keys(addressMap).length;
  const totalContacts = Object.values(addressMap).reduce(
    (sum, addr) => sum + addr.contacts.length,
    0
  );
  console.log(`✓ Grouped into ${addressCount} property addresses`);
  console.log(`✓ Total contacts: ${totalContacts}`);

  // Write contacts.json
  console.log('\n💾 Writing contacts.json...');
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(addressMap, null, 2), 'utf8');
  console.log(`✓ Created ${OUTPUT_FILE}`);

  // Load or create contacted.json
  console.log('\n📋 Setting up contacted tracking...');
  const contacted = loadContactedFile();
  const contactedCount = Object.keys(contacted).length;
  
  if (fs.existsSync(CONTACTED_FILE)) {
    console.log(`✓ Loaded existing contacted.json (${contactedCount} contacts marked)`);
  } else {
    fs.writeFileSync(CONTACTED_FILE, JSON.stringify(contacted, null, 2), 'utf8');
    console.log(`✓ Created new contacted.json`);
  }

  // Summary
  console.log('\n✅ Conversion complete!\n');
  console.log('Files created:');
  console.log(`  - ${OUTPUT_FILE}`);
  console.log(`  - ${CONTACTED_FILE}`);
  console.log('\nTo reset contacted tracking: delete contacted.json');
  console.log('To mark a contact as called: add "contact_id": true to contacted.json\n');
}

// Run the script
main();

export { parseCSV, extractPhones, extractEmails, convertToJSON };

