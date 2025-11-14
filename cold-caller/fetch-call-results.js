#!/usr/bin/env node

/**
 * Fetch Call Results from Vapi
 * 
 * Queries the Vapi API to get results for all in-progress calls and updates
 * contacted.json with the real outcomes.
 * 
 * Usage:
 *   node fetch-call-results.js [options]
 * 
 * Examples:
 *   node fetch-call-results.js           # Fetch and update call results
 *   node fetch-call-results.js -v        # Verbose: show raw API responses
 *   node fetch-call-results.js --verbose # Same as -v
 * 
 * Features:
 *   - Finds all calls marked as "in_progress" in contacted.json
 *   - Fetches call details from Vapi API for each call
 *   - Updates contacted.json with real outcomes (answered, voicemail, etc.)
 *   - For failed/voicemail: contact stays pending to try next number
 *   - For answered: contact marked as reached
 *   - Shows dashboard links for each call
 *   - Use --verbose flag to see full API responses
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// File paths (reference data files from deliquency-crawler directory)
const CONTACTED_FILE = path.join(__dirname, '../deliquency-crawler/contacted.json');

/**
 * Load contacted tracking
 */
function loadContacted() {
  if (!fs.existsSync(CONTACTED_FILE)) {
    console.error('❌ Error: contacted.json not found');
    console.error('   No call data to fetch results for\n');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONTACTED_FILE, 'utf8'));
}

/**
 * Save contacted tracking
 */
function saveContacted(contacted) {
  fs.writeFileSync(CONTACTED_FILE, JSON.stringify(contacted, null, 2), 'utf8');
}

/**
 * Find all in-progress call attempts
 */
function findInProgressCalls(contacted) {
  const inProgressCalls = [];
  
  for (const [contactId, contactData] of Object.entries(contacted)) {
    if (!contactData.attempts) continue;
    
    for (const attempt of contactData.attempts) {
      if (attempt.outcome === 'in_progress' && attempt.vapiCallId) {
        inProgressCalls.push({
          contactId,
          attempt,
          contactData
        });
      }
    }
  }
  
  return inProgressCalls;
}

/**
 * Fetch call details from Vapi API
 */
async function fetchCallDetails(callId, apiKey) {
  try {
    const response = await fetch(`https://api.vapi.ai/call/${callId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`   ❌ Error fetching call ${callId}:`, error.message);
    return null;
  }
}

/**
 * Format call duration in seconds to readable format
 */
function formatDuration(seconds) {
  if (!seconds) return 'N/A';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

/**
 * Map Vapi call details to our outcome format
 * 
 * @param {object} callDetails - Vapi call details
 * @returns {string} - 'answered' | 'voicemail' | 'no_answer' | 'busy' | 'failed'
 */
function mapVapiOutcome(callDetails) {
  const status = callDetails.status;
  const endedReason = callDetails.endedReason;
  
  // Call is still in progress
  if (status === 'queued' || status === 'ringing' || status === 'in-progress') {
    return 'in_progress';
  }
  
  // Call ended - check reason
  if (status === 'ended') {
    // Check for voicemail detection
    if (callDetails.messages && callDetails.messages.length > 0) {
      const hasVoicemailDetection = callDetails.messages.some(msg => 
        msg.role === 'system' && 
        (msg.message?.includes('voicemail') || msg.message?.includes('Voicemail'))
      );
      if (hasVoicemailDetection) {
        return 'voicemail';
      }
    }
    
    // Check endedReason
    if (endedReason === 'assistant-ended-call' || 
        endedReason === 'customer-ended-call' ||
        endedReason === 'assistant-said-end-call-phrase') {
      // Had a conversation - consider it answered
      return 'answered';
    }
    
    if (endedReason === 'voicemail') {
      return 'voicemail';
    }
    
    if (endedReason === 'customer-did-not-answer' || 
        endedReason === 'customer-did-not-give-microphone-permission') {
      return 'no_answer';
    }
    
    if (endedReason === 'customer-busy') {
      return 'busy';
    }
    
    // Check if call had meaningful duration (answered)
    if (callDetails.startedAt && callDetails.endedAt) {
      const durationMs = new Date(callDetails.endedAt) - new Date(callDetails.startedAt);
      const durationSec = durationMs / 1000;
      
      // If call lasted more than 10 seconds, consider it answered
      if (durationSec > 10) {
        return 'answered';
      }
    }
  }
  
  // Failed or error status
  if (status === 'failed' || status === 'error') {
    return 'failed';
  }
  
  // Default to no_answer for unknown cases
  return 'no_answer';
}

/**
 * Update a contact's attempt with the real outcome
 */
function updateContactOutcome(contacted, contactId, vapiCallId, outcome, callDetails) {
  const contact = contacted[contactId];
  if (!contact || !contact.attempts) return false;
  
  // Find the attempt with this Vapi call ID
  const attempt = contact.attempts.find(a => a.vapiCallId === vapiCallId);
  if (!attempt) return false;
  
  // Update the attempt
  attempt.outcome = outcome;
  attempt.updatedAt = new Date().toISOString();
  
  // Add call duration if available
  if (callDetails.startedAt && callDetails.endedAt) {
    const durationMs = new Date(callDetails.endedAt) - new Date(callDetails.startedAt);
    attempt.durationSeconds = Math.floor(durationMs / 1000);
  }
  
  // Add cost if available
  if (callDetails.cost !== undefined) {
    attempt.cost = callDetails.cost;
  }
  
  // Update contact status based on outcome
  if (outcome === 'answered') {
    contact.status = 'reached';
  } else if (outcome === 'in_progress') {
    contact.status = 'in_progress';
  } else {
    // For voicemail, no_answer, busy, failed - keep as pending to try next number
    contact.status = 'pending';
  }
  
  return true;
}

/**
 * Main function
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 Fetch Call Results from Vapi');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  // Validate API key
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: VAPI_API_KEY not found in environment');
    console.error('   Please add VAPI_API_KEY to .env file\n');
    process.exit(1);
  }
  
  // Load contacted data
  const contacted = loadContacted();
  
  // Find in-progress calls
  const inProgressCalls = findInProgressCalls(contacted);
  
  console.log(`🔍 Found ${inProgressCalls.length} in-progress call(s)\n`);
  
  if (inProgressCalls.length === 0) {
    console.log('✅ No in-progress calls to fetch results for');
    console.log('   All calls have been resolved!\n');
    return;
  }
  
  // Fetch results for each call
  let updatedCount = 0;
  let stillInProgressCount = 0;
  let errorCount = 0;
  let answeredCount = 0;
  let voicemailCount = 0;
  let noAnswerCount = 0;
  let busyCount = 0;
  let failedCount = 0;
  
  const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');
  
  for (let i = 0; i < inProgressCalls.length; i++) {
    const { contactId, attempt, contactData } = inProgressCalls[i];
    const callId = attempt.vapiCallId;
    
    console.log(`\n[${i + 1}/${inProgressCalls.length}] Fetching call: ${callId}`);
    if (contactData.name) {
      console.log(`   Contact: ${contactData.name}`);
    }
    if (contactData.propertyAddress) {
      console.log(`   Property: ${contactData.propertyAddress}`);
    }
    console.log(`   Phone: ${attempt.phone}`);
    console.log(`   Initiated: ${attempt.timestamp}`);
    
    const callDetails = await fetchCallDetails(callId, apiKey);
    
    if (!callDetails) {
      errorCount++;
      continue;
    }
    
    // Map Vapi result to our outcome
    const outcome = mapVapiOutcome(callDetails);
    
    // Display call details
    console.log('\n   📋 Call Details:');
    console.log(`   ├─ Vapi Status: ${callDetails.status || 'unknown'}`);
    
    if (callDetails.endedReason) {
      console.log(`   ├─ End Reason: ${callDetails.endedReason}`);
    }
    
    // Calculate and display duration
    if (callDetails.startedAt && callDetails.endedAt) {
      const durationMs = new Date(callDetails.endedAt) - new Date(callDetails.startedAt);
      const durationSec = durationMs / 1000;
      console.log(`   ├─ Duration: ${formatDuration(durationSec)}`);
    }
    
    if (callDetails.cost !== undefined) {
      console.log(`   ├─ Cost: $${callDetails.cost.toFixed(4)}`);
    }
    
    // Show our mapped outcome
    const outcomeEmojis = {
      'answered': '✅',
      'voicemail': '📫',
      'no_answer': '📵',
      'busy': '📞',
      'failed': '❌',
      'in_progress': '⏳'
    };
    console.log(`   ├─ Outcome: ${outcomeEmojis[outcome] || '❓'} ${outcome.toUpperCase()}`);
    
    // Update contacted.json
    const updated = updateContactOutcome(contacted, contactId, callId, outcome, callDetails);
    if (updated) {
      updatedCount++;
      
      // Count by outcome
      if (outcome === 'answered') answeredCount++;
      else if (outcome === 'voicemail') voicemailCount++;
      else if (outcome === 'no_answer') noAnswerCount++;
      else if (outcome === 'busy') busyCount++;
      else if (outcome === 'failed') failedCount++;
      else if (outcome === 'in_progress') stillInProgressCount++;
      
      console.log(`   └─ ✅ Updated contacted.json`);
    } else {
      console.log(`   └─ ⚠️  Could not update contacted.json`);
    }
    
    console.log(`      Dashboard: https://dashboard.vapi.ai/calls/${callId}`);
    
    // Display raw API response for debugging
    if (verbose) {
      console.log('\n   🔍 Raw API Response:');
      console.log('   ' + JSON.stringify(callDetails, null, 2).split('\n').join('\n   '));
    }
    
    // Small delay between API calls
    if (i < inProgressCalls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  // Save updated contacted.json
  if (updatedCount > 0) {
    saveContacted(contacted);
    console.log('\n💾 Saved updated contacted.json');
  }
  
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 Summary:');
  console.log(`   📞 Total processed: ${inProgressCalls.length}`);
  console.log(`   ✅ Updated: ${updatedCount}`);
  if (answeredCount > 0) console.log(`   ✅ Answered: ${answeredCount}`);
  if (voicemailCount > 0) console.log(`   📫 Voicemail: ${voicemailCount}`);
  if (noAnswerCount > 0) console.log(`   📵 No Answer: ${noAnswerCount}`);
  if (busyCount > 0) console.log(`   📞 Busy: ${busyCount}`);
  if (failedCount > 0) console.log(`   ❌ Failed: ${failedCount}`);
  if (stillInProgressCount > 0) console.log(`   ⏳ Still In Progress: ${stillInProgressCount}`);
  if (errorCount > 0) console.log(`   ❌ API Errors: ${errorCount}`);
  
  console.log('\n💡 Tips:');
  console.log('   - Contacts with voicemail/no_answer/busy/failed stay "pending"');
  console.log('   - Run batch-caller.js again to try next phone numbers');
  console.log('   - Use --verbose flag to see full API responses');
  console.log('═══════════════════════════════════════════════════════════\n');
}

// Run
main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});

