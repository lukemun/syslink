#!/usr/bin/env node

/**
 * Wave-Based Batch Cold Caller
 * 
 * Spawns calls asynchronously for X properties at a time, recording call IDs
 * without waiting for results. Properties with in-progress calls are skipped
 * until their status is updated via fetch-call-results.js.
 * 
 * Usage:
 *   node batch-caller.js [wave_size] [contacts_per_property] [--dry-run]
 * 
 * Examples:
 *   node batch-caller.js                # Default: 10 properties, ALL contacts per property
 *   node batch-caller.js 5              # 5 properties, ALL contacts per property
 *   node batch-caller.js 20 2           # 20 properties, 2 contacts per property
 *   node batch-caller.js 10 1           # 10 properties, 1 contact per property
 *   node batch-caller.js 10 --dry-run   # Dry run: show what would be called without making calls
 * 
 * Features:
 *   - Calls specified number of contacts at each property with their best phone number
 *   - Default is to call ALL contacts if contacts_per_property not specified
 *   - Skips properties with in-progress calls
 *   - Skips properties that have been successfully reached
 *   - Records call IDs immediately without waiting for results
 *   - Use fetch-call-results.js to check call outcomes
 *   - Dry run mode to preview calls without executing them
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File paths (reference data files from deliquency-crawler directory)
const CONTACTS_FILE = path.join(__dirname, '../deliquency-crawler/contacts.json');
const CONTACTED_FILE = path.join(__dirname, '../deliquency-crawler/contacted.json');
const COLD_CALLER_SCRIPT = path.join(__dirname, 'make-call.ts');

/**
 * Load contacts from JSON file
 */
function loadContacts() {
  if (!fs.existsSync(CONTACTS_FILE)) {
    console.error('❌ Error: contacts.json not found');
    console.error('   Run: node convert-contacts.js in deliquency-crawler first\n');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));
}

/**
 * Load contacted tracking (with auto-conversion from old format)
 */
function loadContacted() {
  if (!fs.existsSync(CONTACTED_FILE)) {
    return {};
  }
  
  const data = JSON.parse(fs.readFileSync(CONTACTED_FILE, 'utf8'));
  
  // Convert old boolean format to new detailed format
  const firstKey = Object.keys(data)[0];
  if (firstKey && typeof data[firstKey] === 'boolean') {
    console.log('🔄 Converting old contacted.json format...');
    const converted = {};
    for (const [contactId, value] of Object.entries(data)) {
      if (value === true) {
        converted[contactId] = {
          attempts: [],
          status: 'reached',
          lastAttempt: new Date().toISOString()
        };
      }
    }
    saveContacted(converted);
    return converted;
  }
  
  return data;
}

/**
 * Save contacted tracking
 */
function saveContacted(contacted) {
  fs.writeFileSync(CONTACTED_FILE, JSON.stringify(contacted, null, 2), 'utf8');
}

/**
 * Record a call attempt
 * 
 * @param {string} contactId - The contact ID
 * @param {string} contactName - The contact's name
 * @param {string} propertyAddress - The property address
 * @param {string} phoneNumber - Phone number called
 * @param {string} outcome - 'answered' | 'voicemail' | 'no_answer' | 'busy' | 'failed' | 'invalid_number' | 'in_progress'
 * @param {string} vapiCallId - Optional Vapi call ID
 * @param {object} contacted - The contacted tracking object
 */
function recordCallAttempt(contactId, contactName, propertyAddress, phoneNumber, outcome, vapiCallId, contacted) {
  if (!contacted[contactId]) {
    contacted[contactId] = {
      name: contactName,
      propertyAddress: propertyAddress,
      attempts: [],
      status: 'pending',
      lastAttempt: null
    };
  } else {
    // Update name and address in case they weren't set before
    contacted[contactId].name = contactName;
    contacted[contactId].propertyAddress = propertyAddress;
  }
  
  const timestamp = new Date().toISOString();
  
  // Add this attempt
  const attempt = {
    timestamp,
    phone: phoneNumber,
    outcome
  };
  
  // Add Vapi call ID if available
  if (vapiCallId) {
    attempt.vapiCallId = vapiCallId;
    attempt.vapiDashboardUrl = `https://dashboard.vapi.ai/calls/${vapiCallId}`;
  }
  
  contacted[contactId].attempts.push(attempt);
  
  contacted[contactId].lastAttempt = timestamp;
  
  // Update status based on outcome
  if (outcome === 'answered') {
    contacted[contactId].status = 'reached';
  } else if (outcome === 'in_progress') {
    contacted[contactId].status = 'in_progress';
  } else if (['voicemail', 'no_answer', 'busy'].includes(outcome)) {
    // Keep as pending if we might want to try other numbers
    contacted[contactId].status = 'pending';
  } else if (outcome === 'failed' || outcome === 'invalid_number') {
    // Mark as pending but with failed attempt recorded
    contacted[contactId].status = 'pending';
  }
  
  saveContacted(contacted);
}

/**
 * Get best phone number from a contact that hasn't been tried yet
 * 
 * @param {object} contact - The contact object
 * @param {Array<string>} triedNumbers - Array of phone numbers already attempted
 * @returns {object|null} - Best phone to try, or null if all tried
 */
function getBestPhone(contact, triedNumbers = []) {
  const phones = contact.phones || [];
  
  // Filter out empty numbers and already-tried numbers
  const validPhones = phones.filter(p => 
    p.number && 
    p.number.trim() && 
    !triedNumbers.includes(p.number)
  );
  
  if (validPhones.length === 0) return null;
  
  // Score phones (higher is better)
  const scoredPhones = validPhones.map(phone => {
    let score = 0;
    
    // Prefer not do-not-call
    if (!phone.do_not_call) score += 100;
    
    // Prefer active status
    if (phone.status && phone.status.includes('Active for 12 months')) score += 50;
    if (phone.status && phone.status.includes('Active for 1 month')) score += 30;
    
    // Prefer heavy usage
    if (phone.usage_12_months && phone.usage_12_months.includes('Heavy')) score += 20;
    if (phone.usage_12_months && phone.usage_12_months.includes('Moderate')) score += 10;
    
    // Prefer wireless
    if (phone.type && phone.type === 'Wireless') score += 5;
    
    return { phone, score };
  });
  
  // Sort by score and return best
  scoredPhones.sort((a, b) => b.score - a.score);
  return scoredPhones[0].phone;
}

/**
 * Get tried phone numbers for a contact
 */
function getTriedNumbers(contactId, contacted) {
  if (!contacted[contactId] || !contacted[contactId].attempts) {
    return [];
  }
  return contacted[contactId].attempts.map(a => a.phone);
}

/**
 * Check if a contact has been reached
 */
function isContactReached(contactId, contacted) {
  return contacted[contactId] && contacted[contactId].status === 'reached';
}

/**
 * Check if a contact has in-progress calls
 */
function hasInProgressCalls(contactId, contacted) {
  if (!contacted[contactId] || !contacted[contactId].attempts) {
    return false;
  }
  return contacted[contactId].attempts.some(a => a.outcome === 'in_progress');
}

/**
 * Check if a property has any in-progress calls
 */
function propertyHasInProgressCalls(propertyAddress, contacts, contacted) {
  const propertyData = contacts[propertyAddress];
  if (!propertyData) return false;
  
  return propertyData.contacts.some(contact => 
    hasInProgressCalls(contact.contact_id, contacted)
  );
}

/**
 * Check if a property has been successfully contacted
 */
function isPropertyReached(propertyAddress, contacts, contacted) {
  const propertyData = contacts[propertyAddress];
  if (!propertyData) return false;
  
  return propertyData.contacts.some(contact => 
    isContactReached(contact.contact_id, contacted)
  );
}

/**
 * Check if a contact should be tried (has untried numbers and not reached)
 */
function shouldTryContact(contact, contactId, contacted) {
  if (isContactReached(contactId, contacted)) {
    return false; // Already reached, don't retry
  }
  
  if (hasInProgressCalls(contactId, contacted)) {
    return false; // Has in-progress calls, wait for results
  }
  
  const triedNumbers = getTriedNumbers(contactId, contacted);
  const availablePhone = getBestPhone(contact, triedNumbers);
  
  return availablePhone !== null; // Try if there are untried numbers
}

/**
 * Extract city from property address
 */
function extractCity(address) {
  // Format: "Street, City, State Zip"
  const parts = address.split(',');
  if (parts.length >= 2) {
    return parts[1].trim();
  }
  return 'Florida';
}

/**
 * Make a call using the cold caller script (async, doesn't wait for completion)
 * 
 * @returns {Promise<{success: boolean, outcome: string, phone: string, vapiCallId: string|null}>}
 */
async function makeCall(contact, propertyAddress, contacted) {
  const triedNumbers = getTriedNumbers(contact.contact_id, contacted);
  const phone = getBestPhone(contact, triedNumbers);
  
  if (!phone) {
    console.log(`   ⚠️  No untried phone numbers for ${contact.name}`);
    return { success: false, outcome: 'no_numbers', phone: null, vapiCallId: null };
  }
  
  // Format phone number (add +1 if not present)
  let targetNumber = phone.number.replace(/\D/g, '');
  if (!targetNumber.startsWith('1') && targetNumber.length === 10) {
    targetNumber = '1' + targetNumber;
  }
  targetNumber = '+' + targetNumber;
  
  // Extract first name
  const firstName = contact.name.split(' ')[0] || 'there';
  const city = extractCity(propertyAddress);
  
  const attemptCount = triedNumbers.length + 1;
  console.log(`\n📞 Calling: ${contact.name} (Attempt #${attemptCount})`);
  console.log(`   Phone: ${phone.number} (${phone.type})`);
  console.log(`   Status: ${phone.status}`);
  if (phone.do_not_call) {
    console.log(`   ⚠️  DO NOT CALL flag set`);
  }
  console.log(`   Property: ${propertyAddress}`);
  
  // Capture stdout to extract Vapi call ID
  let capturedOutput = '';
  let vapiCallId = null;
  
  const callResult = await new Promise((resolve) => {
    const env = {
      ...process.env,
      TARGET_PHONE_NUMBER: targetNumber,
      PROPERTY_ADDRESS: propertyAddress,
      PROPERTY_CITY: city,
      FIRST_NAME: firstName,
    };
    
    const caller = spawn('npx', ['tsx', COLD_CALLER_SCRIPT], {
      env,
      stdio: ['inherit', 'pipe', 'inherit'] // Pipe stdout to capture it
    });
    
    // Capture stdout and look for call ID
    caller.stdout.on('data', (data) => {
      const output = data.toString();
      process.stdout.write(output); // Still show to user
      capturedOutput += output;
      
      // Extract Vapi call ID if present
      const match = output.match(/__VAPI_CALL_ID__:([a-f0-9-]+)/);
      if (match) {
        vapiCallId = match[1];
      }
    });
    
    caller.on('close', (code) => {
      if (code === 0 && vapiCallId) {
        resolve(true);
      } else {
        if (code !== 0) {
          console.log(`   ❌ Call script exited with code ${code}`);
        }
        resolve(false);
      }
    });
    
    caller.on('error', (err) => {
      console.error(`   ❌ Error spawning caller:`, err.message);
      resolve(false);
    });
  });
  
  if (!callResult) {
    console.log(`   💥 Failed to initiate call\n`);
    return { success: false, outcome: 'failed', phone: phone.number, vapiCallId: null };
  }
  
  if (!vapiCallId) {
    console.log(`   ⚠️  Call spawned but no Vapi call ID captured\n`);
    return { success: false, outcome: 'failed', phone: phone.number, vapiCallId: null };
  }
  
  console.log(`   ✅ Call queued successfully\n`);
  
  // Return immediately with in_progress status
  return {
    success: true, // Successfully initiated
    outcome: 'in_progress',
    phone: phone.number,
    vapiCallId
  };
}

/**
 * Main batch calling function
 */
async function main() {
  // Check for dry run mode and filter it out from numeric args
  const isDryRun = process.argv.includes('--dry-run');
  const numericArgs = process.argv.slice(2).filter(arg => arg !== '--dry-run');
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🏠 Wave-Based Batch Cold Caller');
  if (isDryRun) {
    console.log('🧪 DRY RUN MODE - No calls will be made');
  }
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Load data
  const contacts = loadContacts();
  const contacted = loadContacted();
  
  const addresses = Object.keys(contacts);
  console.log(`📊 Loaded ${addresses.length} properties with contacts`);
  
  // Count contacts by status
  let totalReached = 0;
  let totalInProgress = 0;
  let totalPending = 0;
  let totalUntouched = 0;
  
  for (const address of addresses) {
    for (const contact of contacts[address].contacts) {
      if (isContactReached(contact.contact_id, contacted)) {
        totalReached++;
      } else if (hasInProgressCalls(contact.contact_id, contacted)) {
        totalInProgress++;
      } else if (contacted[contact.contact_id]) {
        totalPending++;
      } else {
        totalUntouched++;
      }
    }
  }
  
  const totalContacts = totalReached + totalInProgress + totalPending + totalUntouched;
  
  console.log(`📊 Status: ${totalReached} reached | ${totalInProgress} in-progress | ${totalPending} pending | ${totalUntouched} untouched`);
  console.log(`🎯 ${totalInProgress + totalPending + totalUntouched} contacts remaining\n`);
  
  if (totalInProgress > 0) {
    console.log(`⏳ Note: ${totalInProgress} calls are in-progress. Run fetch-call-results.js to update their status.\n`);
  }
  
  if (totalPending + totalUntouched === 0 && totalInProgress === 0) {
    console.log('✅ All contacts have been successfully reached!');
    console.log('💡 To reset: rm contacted.json && node convert-contacts.js\n');
    return;
  }
  
  // Get wave size and contacts per property from numeric args (--dry-run filtered out)
  const waveSize = parseInt(numericArgs[0]) || 10;
  // If no contacts_per_property specified, use Infinity to call all contacts
  const contactsPerProperty = numericArgs[1] ? parseInt(numericArgs[1]) : Infinity;
  // Batch size for concurrent calls (to respect Vapi's concurrency limit)
  const batchSize = 5;
  const batchDelayMs = 60000; // 1 minute between batches
  console.log(`🌊 Wave size: ${waveSize} properties per wave`);
  console.log(`📦 Batch size: ${batchSize} properties per batch (${batchDelayMs / 1000}s delay between batches)`);
  console.log(`👥 Contacts per property: ${contactsPerProperty === Infinity ? 'all' : contactsPerProperty}\n`);
  
  // Select properties to call in this wave
  // Skip properties that are already reached or have in-progress calls
  const propertiesToCall = addresses.filter(address => {
    if (isPropertyReached(address, contacts, contacted)) {
      return false; // Skip if already reached
    }
    if (propertyHasInProgressCalls(address, contacts, contacted)) {
      return false; // Skip if has in-progress calls
    }
    
    // Check if property has any contacts to try
    const propertyData = contacts[address];
    const hasContactsToTry = propertyData.contacts.some(contact => 
      shouldTryContact(contact, contact.contact_id, contacted)
    );
    
    return hasContactsToTry;
  }).slice(0, waveSize);
  
  if (propertiesToCall.length === 0) {
    console.log('⚠️  No properties available for calling in this wave.');
    console.log('   All properties are either reached or have in-progress calls.');
    console.log('   Run fetch-call-results.js to update in-progress call statuses.\n');
    return;
  }
  
  console.log(`🎯 Selected ${propertiesToCall.length} properties for this wave\n`);
  
  let callsInitiated = 0;
  let callsFailed = 0;
  
  // Dry run mode - just show what would be called
  if (isDryRun) {
    console.log('📋 Dry Run Preview - Calls that would be made:\n');
    
    // Split properties into batches for dry run preview too
    const dryRunBatches = [];
    for (let i = 0; i < propertiesToCall.length; i += batchSize) {
      dryRunBatches.push(propertiesToCall.slice(i, i + batchSize));
    }
    
    console.log(`📦 Would process ${dryRunBatches.length} batch(es) of up to ${batchSize} properties each\n`);
    
    for (let batchIndex = 0; batchIndex < dryRunBatches.length; batchIndex++) {
      const batch = dryRunBatches[batchIndex];
      const batchNum = batchIndex + 1;
      
      console.log(`${'═'.repeat(63)}`);
      console.log(`📦 BATCH ${batchNum}/${dryRunBatches.length} (${batch.length} properties)`);
      console.log(`${'═'.repeat(63)}\n`);
      
      for (const address of batch) {
        const propertyData = contacts[address];
        
        console.log(`🏠 Property: ${address}`);
        
        // Get all contacts that should be tried
        const allContactsToTry = propertyData.contacts.filter(contact => 
          shouldTryContact(contact, contact.contact_id, contacted)
        );
        
        // Limit to contactsPerProperty
        const contactsToTry = allContactsToTry.slice(0, contactsPerProperty);
        
        console.log(`   ${allContactsToTry.length} contact(s) available, would call ${contactsToTry.length}:\n`);
        
        for (const contact of contactsToTry) {
          const triedNumbers = getTriedNumbers(contact.contact_id, contacted);
          const phone = getBestPhone(contact, triedNumbers);
          
          if (!phone) {
            console.log(`   ⏭️  ${contact.name} - no available numbers`);
            continue;
          }
          
          // Format phone number
          let targetNumber = phone.number.replace(/\D/g, '');
          if (!targetNumber.startsWith('1') && targetNumber.length === 10) {
            targetNumber = '1' + targetNumber;
          }
          targetNumber = '+' + targetNumber;
          
          const firstName = contact.name.split(' ')[0] || 'there';
          const city = extractCity(address);
          
          console.log(`   📞 ${contact.name}`);
          console.log(`      Phone: ${phone.number} (${phone.type})`);
          console.log(`      Status: ${phone.status || 'Unknown'}`);
          if (phone.do_not_call) {
            console.log(`      ⚠️  DO NOT CALL flag set`);
          }
          console.log(`      First Name: ${firstName}`);
          console.log(`      City: ${city}`);
          console.log('');
          
          callsInitiated++;
        }
        
        console.log('');
      }
      
      // Show delay message between batches
      if (batchIndex < dryRunBatches.length - 1) {
        const delaySeconds = batchDelayMs / 1000;
        console.log(`⏸️  Would wait ${delaySeconds} seconds before next batch...\n\n`);
      }
    }
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📊 Dry Run Summary:`);
    console.log(`   📞 ${callsInitiated} call(s) would be made`);
    console.log(`   🏠 ${propertiesToCall.length} properties would be called`);
    console.log(`   📦 ${dryRunBatches.length} batch(es) with ${batchDelayMs / 1000}s delays between them`);
    console.log('\n💡 Remove --dry-run flag to make actual calls');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    return;
  }
  
  // Split properties into batches to respect concurrency limits
  const batches = [];
  for (let i = 0; i < propertiesToCall.length; i += batchSize) {
    batches.push(propertiesToCall.slice(i, i + batchSize));
  }
  
  console.log(`📦 Processing ${batches.length} batch(es) of up to ${batchSize} properties each\n`);
  
  // Process each batch (normal mode)
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchNum = batchIndex + 1;
    
    console.log(`\n${'═'.repeat(63)}`);
    console.log(`📦 BATCH ${batchNum}/${batches.length} (${batch.length} properties)`);
    console.log(`${'═'.repeat(63)}\n`);
    
    for (const address of batch) {
      const propertyData = contacts[address];
      
      console.log(`\n🏠 Property: ${address}`);
      
      // Get all contacts that should be tried
      const allContactsToTry = propertyData.contacts.filter(contact => 
        shouldTryContact(contact, contact.contact_id, contacted)
      );
      
      // Limit to contactsPerProperty
      const contactsToTry = allContactsToTry.slice(0, contactsPerProperty);
      
      console.log(`   ${allContactsToTry.length} contact(s) available, calling ${contactsToTry.length}\n`);
      
      let propertyInitiated = 0;
      let propertyFailed = 0;
      
      // Call all contacts with their best phone number
      for (const contact of contactsToTry) {
        const result = await makeCall(contact, address, contacted);
        
        if (result.outcome === 'no_numbers') {
          console.log(`   ⏭️  Skipping ${contact.name} - no available numbers\n`);
          continue; // Skip if no numbers available
        }
        
        // Record the attempt with Vapi call ID, name, and address
        recordCallAttempt(
          contact.contact_id,
          contact.name,
          address,
          result.phone,
          result.outcome,
          result.vapiCallId,
          contacted
        );
        
        if (result.success) {
          callsInitiated++;
          propertyInitiated++;
        } else {
          callsFailed++;
          propertyFailed++;
        }
        
        // Small delay between calls to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      console.log(`   📋 Property Summary: ${propertyInitiated} initiated, ${propertyFailed} failed\n`);
    }
    
    // Add delay between batches (except after the last batch)
    if (batchIndex < batches.length - 1) {
      const delaySeconds = batchDelayMs / 1000;
      console.log(`\n⏸️  Waiting ${delaySeconds} seconds before next batch to respect concurrency limits...\n`);
      await new Promise(resolve => setTimeout(resolve, batchDelayMs));
    }
  }
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📊 Wave Complete:`);
  console.log(`   ✅ ${callsInitiated} call(s) successfully initiated`);
  console.log(`   ❌ ${callsFailed} call(s) failed to initiate`);
  
  if (callsInitiated > 0) {
    console.log(`   ⏳ ${callsInitiated} call(s) marked as in-progress`);
    console.log(`   💡 Run fetch-call-results.js to check call outcomes`);
  }
  
  if (callsFailed > 0) {
    console.log(`\n⚠️  Some calls failed to initiate. Common issues:`);
    console.log(`   - Dependencies not installed: cd cold-caller && npm install`);
    console.log(`   - Missing environment variables in .env file`);
    console.log(`   - Vapi API key not configured`);
  }
  
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Run
main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});

