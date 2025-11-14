#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// File paths
const CONTACTS_FILE = path.join(__dirname, 'contacts.json');
const CONTACTED_FILE = path.join(__dirname, 'contacted.json');
const COLD_CALLER_SCRIPT = path.join(__dirname, '../cold-caller/make-call.ts');

/**
 * Load contacts from JSON file
 */
function loadContacts() {
  if (!fs.existsSync(CONTACTS_FILE)) {
    console.error('❌ Error: contacts.json not found');
    console.error('   Run: node convert-contacts.js first\n');
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
 * @param {string} phoneNumber - Phone number called
 * @param {string} outcome - 'answered' | 'voicemail' | 'no_answer' | 'busy' | 'failed' | 'invalid_number'
 * @param {string} vapiCallId - Optional Vapi call ID
 * @param {object} contacted - The contacted tracking object
 */
function recordCallAttempt(contactId, phoneNumber, outcome, vapiCallId, contacted) {
  if (!contacted[contactId]) {
    contacted[contactId] = {
      attempts: [],
      status: 'pending',
      lastAttempt: null
    };
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
 * Check if a contact should be retried (has untried numbers and not reached)
 */
function shouldRetryContact(contact, contactId, contacted) {
  if (isContactReached(contactId, contacted)) {
    return false; // Already reached, don't retry
  }
  
  const triedNumbers = getTriedNumbers(contactId, contacted);
  const availablePhone = getBestPhone(contact, triedNumbers);
  
  return availablePhone !== null; // Retry if there are untried numbers
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
 * Make a call using the cold caller script
 * 
 * @returns {Promise<{success: boolean, outcome: string, phone: string}>}
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
  
  // Capture stdout to extract Vapi call ID while still showing output
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
    
    const caller = spawn('tsx', [COLD_CALLER_SCRIPT], {
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
      if (code === 0) {
        console.log(`   ✅ Call placed`);
        if (vapiCallId) {
          console.log(`   📋 Vapi Call ID: ${vapiCallId}`);
        }
        resolve(true);
      } else {
        console.log(`   ❌ Call failed with code ${code}`);
        resolve(false);
      }
    });
    
    caller.on('error', (err) => {
      console.error(`   ❌ Error spawning caller:`, err.message);
      resolve(false);
    });
  });
  
  if (!callResult) {
    return { success: false, outcome: 'failed', phone: phone.number, vapiCallId: null };
  }
  
  // Prompt for call outcome
  console.log('\n❓ Call outcome:');
  console.log('   1) Answered - spoke with person');
  console.log('   2) Voicemail - left message');
  console.log('   3) No answer - rang but no pickup');
  console.log('   4) Busy signal');
  console.log('   5) Invalid number');
  console.log('   (Press Enter for default: voicemail)');
  
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const outcome = await new Promise((resolve) => {
    rl.question('   Enter choice (1-5): ', (answer) => {
      rl.close();
      const choice = answer.trim() || '2';
      const outcomes = {
        '1': 'answered',
        '2': 'voicemail',
        '3': 'no_answer',
        '4': 'busy',
        '5': 'invalid_number'
      };
      resolve(outcomes[choice] || 'voicemail');
    });
  });
  
  const outcomeLabels = {
    'answered': '✅ Answered',
    'voicemail': '📫 Voicemail',
    'no_answer': '📵 No Answer',
    'busy': '📞 Busy',
    'invalid_number': '❌ Invalid Number'
  };
  
  console.log(`   Recorded: ${outcomeLabels[outcome]}\n`);
  
  return {
    success: outcome === 'answered',
    outcome,
    phone: phone.number,
    vapiCallId
  };
}

/**
 * Main batch calling function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🏠 DealMachine Batch Cold Caller');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Load data
  const contacts = loadContacts();
  const contacted = loadContacted();
  
  const addresses = Object.keys(contacts);
  console.log(`📊 Loaded ${addresses.length} properties with contacts`);
  
  // Count contacts by status
  let totalReached = 0;
  let totalPending = 0;
  let totalUntouched = 0;
  
  for (const address of addresses) {
    for (const contact of contacts[address].contacts) {
      if (isContactReached(contact.contact_id, contacted)) {
        totalReached++;
      } else if (contacted[contact.contact_id]) {
        totalPending++;
      } else {
        totalUntouched++;
      }
    }
  }
  
  const totalContacts = totalReached + totalPending + totalUntouched;
  
  console.log(`📊 Status: ${totalReached} reached | ${totalPending} pending | ${totalUntouched} untouched`);
  console.log(`🎯 ${totalPending + totalUntouched} contacts remaining\n`);
  
  if (totalPending + totalUntouched === 0) {
    console.log('✅ All contacts have been successfully reached!');
    console.log('💡 To reset: rm contacted.json && node convert-contacts.js\n');
    return;
  }
  
  // Get batch size from args or default to 5
  const batchSize = parseInt(process.argv[2]) || 5;
  console.log(`📦 Batch size: ${batchSize} call(s) per session\n`);
  
  let callsMade = 0;
  let contactsReached = 0;
  
  // Process each property
  addressLoop:
  for (const address of addresses) {
    const propertyData = contacts[address];
    
    // Get all contacts that should be tried (not reached and have untried numbers)
    const contactsToTry = propertyData.contacts.filter(contact => 
      shouldRetryContact(contact, contact.contact_id, contacted)
    );
    
    if (contactsToTry.length === 0) continue;
    
    console.log(`\n🏠 Property: ${address}`);
    console.log(`   ${contactsToTry.length} contact(s) with untried numbers\n`);
    
    let propertyReached = false;
    
    // Try contacts at this property until we reach someone or run out
    for (const contact of contactsToTry) {
      if (callsMade >= batchSize) {
        console.log('\n📦 Batch limit reached');
        break addressLoop;
      }
      
      // Try this contact (may try multiple numbers)
      const maxAttemptsPerContact = 2; // Try up to 2 numbers per contact
      let attemptsForContact = 0;
      
      while (attemptsForContact < maxAttemptsPerContact && !propertyReached) {
        const result = await makeCall(contact, address, contacted);
        
        if (result.outcome === 'no_numbers') {
          break; // No more numbers to try for this contact
        }
        
        // Record the attempt with Vapi call ID
        recordCallAttempt(contact.contact_id, result.phone, result.outcome, result.vapiCallId, contacted);
        callsMade++;
        attemptsForContact++;
        
        if (result.success) {
          console.log(`   🎉 Successfully reached ${contact.name}!`);
          contactsReached++;
          propertyReached = true;
          break; // Move to next property since we reached someone
        }
        
        // If we got voicemail or no answer, try another number for this contact
        if (['voicemail', 'no_answer', 'busy'].includes(result.outcome)) {
          const hasMoreNumbers = shouldRetryContact(contact, contact.contact_id, contacted);
          if (hasMoreNumbers && attemptsForContact < maxAttemptsPerContact) {
            console.log(`   🔄 Trying another number for ${contact.name}...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
        }
        
        break; // Move to next contact
      }
      
      if (propertyReached) {
        console.log(`   ✅ Property contact established, moving to next property\n`);
        break; // Move to next property
      }
      
      // Wait between contacts
      if (callsMade < batchSize && !propertyReached) {
        console.log('\n⏳ Waiting 3 seconds before next contact...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`📊 Session complete:`);
  console.log(`   📞 ${callsMade} call(s) made`);
  console.log(`   ✅ ${contactsReached} contact(s) reached`);
  console.log(`   🎯 ${totalPending + totalUntouched - contactsReached} contacts remaining`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Run
main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});

