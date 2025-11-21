#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File paths
const INPUT_FILE = path.join(__dirname, 'contacts.json');
const OUTPUT_FILE = path.join(__dirname, 'contacts-trimmed.json');

/**
 * Trim phone data to only include number and type
 */
function trimPhones(phones) {
  return phones.map(phone => ({
    number: phone.number,
    type: phone.type
  }));
}

/**
 * Trim contact data to only include essential fields
 */
function trimContact(contact) {
  return {
    name: contact.name,
    mailing_address: contact.mailing_address,
    emails: contact.emails,
    phones: trimPhones(contact.phones)
  };
}

/**
 * Trim the entire contacts structure
 */
function trimContacts(contactsData) {
  const trimmed = {};

  for (const [address, propertyData] of Object.entries(contactsData)) {
    trimmed[address] = {
      property_address: propertyData.property_address,
      estimated_value: propertyData.estimated_value,
      equity_percent: propertyData.equity_percent,
      dealmachine_url: propertyData.dealmachine_url,
      contacts: propertyData.contacts.map(trimContact)
    };
  }

  return trimmed;
}

/**
 * Main function
 */
function main() {
  console.log('📋 Contact List Trimmer\n');

  // Check if input file exists
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Error: Input file not found at ${INPUT_FILE}`);
    process.exit(1);
  }

  // Read contacts.json
  console.log('📄 Reading contacts.json...');
  const contactsData = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  const propertyCount = Object.keys(contactsData).length;
  const totalContacts = Object.values(contactsData).reduce(
    (sum, prop) => sum + prop.contacts.length,
    0
  );
  console.log(`✓ Loaded ${propertyCount} properties with ${totalContacts} contacts`);

  // Trim the data
  console.log('\n✂️  Trimming data...');
  const trimmedData = trimContacts(contactsData);
  console.log('✓ Removed sensitive and unnecessary fields');

  // Calculate size reduction
  const originalSize = JSON.stringify(contactsData).length;
  const trimmedSize = JSON.stringify(trimmedData).length;
  const reduction = ((1 - trimmedSize / originalSize) * 100).toFixed(1);
  console.log(`✓ Size reduced by ${reduction}%`);

  // Write trimmed file
  console.log('\n💾 Writing trimmed file...');
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(trimmedData, null, 2), 'utf8');
  console.log(`✓ Created ${OUTPUT_FILE}`);

  // Summary
  console.log('\n✅ Trimming complete!\n');
  console.log('Trimmed file includes:');
  console.log('  Property Level:');
  console.log('    • Address');
  console.log('    • Estimated Value');
  console.log('    • Equity Percent');
  console.log('    • DealMachine URL');
  console.log('  Contact Level:');
  console.log('    • Name');
  console.log('    • Mailing Address');
  console.log('    • Emails');
  console.log('    • Phones (number and type only)');
  console.log(`\nOutput: ${OUTPUT_FILE}\n`);
}

// Run the script
main();

export { trimPhones, trimContact, trimContacts };







