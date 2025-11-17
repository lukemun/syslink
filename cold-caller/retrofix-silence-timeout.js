#!/usr/bin/env node

/**
 * Retroactively fix call attempts that were marked answered even though
 * Vapi ended them with `silence-timed-out`.
 *
 * The earlier mapping logic treated any call longer than 10 seconds as
 * "answered", so some silent calls were marked reached. This script pulls
 * fresh call details from Vapi, looks for `silence-timed-out` end reasons,
 * and reclassifies those attempts as `no_answer`, putting the contact back
 * into the pending pool for the next wave.
 *
 * Usage:
 *   node retrofix-silence-timeout.js
 *   node retrofix-silence-timeout.js --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const CONTACTED_FILE = path.join(__dirname, '../deliquency-crawler/contacted.json');
const CALL_DELAY_MS = 500;

function loadContacted() {
  if (!fs.existsSync(CONTACTED_FILE)) {
    console.error('❌ contacted.json not found. Nothing to retrofix.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONTACTED_FILE, 'utf8'));
}

function saveContacted(contacted) {
  fs.writeFileSync(CONTACTED_FILE, JSON.stringify(contacted, null, 2), 'utf8');
}

async function fetchCallDetails(callId, apiKey, attempt = 1) {
  const response = await fetch(`https://api.vapi.ai/call/${callId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  if (response.status === 429 && attempt < 3) {
    const backoffMs = 1000 * attempt;
    await new Promise(resolve => setTimeout(resolve, backoffMs));
    return fetchCallDetails(callId, apiKey, attempt + 1);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API ${response.status}: ${text}`);
  }

  return response.json();
}

function recomputeContactStatus(contact) {
  if (!contact.attempts || contact.attempts.length === 0) {
    return 'pending';
  }
  if (contact.attempts.some(a => a.outcome === 'answered')) {
    return 'reached';
  }
  if (contact.attempts.some(a => a.outcome === 'in_progress')) {
    return 'in_progress';
  }
  return 'pending';
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔄 Retrofix silence-timed-out calls');
  console.log('═══════════════════════════════════════════════════════════\n');

  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    console.error('❌ VAPI_API_KEY missing from environment. Add it to ../.env first.');
    process.exit(1);
  }

  const isDryRun = process.argv.includes('--dry-run');

  const contacted = loadContacted();

  const candidates = [];

  for (const [contactId, contactData] of Object.entries(contacted)) {
    if (!contactData.attempts) continue;
    for (const attempt of contactData.attempts) {
      if (
        attempt.vapiCallId &&
        (attempt.outcome === 'answered' || attempt.outcome === 'no_answer')
      ) {
        candidates.push({
          contactId,
          contactData,
          attempt
        });
      }
    }
  }

  if (candidates.length === 0) {
    console.log('✅ No attempts found that require retrofixing.\n');
    return;
  }

  console.log(`🔍 Checking ${candidates.length} attempt(s) with Vapi...\n`);

  let inspected = 0;
  let updated = 0;
  let errored = 0;

  for (let index = 0; index < candidates.length; index++) {
    inspected++;
    const { contactId, contactData, attempt } = candidates[index];
    const callId = attempt.vapiCallId;

    try {
      const callDetails = await fetchCallDetails(callId, apiKey);
      const endedReason = callDetails?.endedReason;

      if (endedReason === 'silence-timed-out') {
        console.log(`📞 ${contactData.name || contactId}`);
        console.log(`   ├─ Call ID: ${callId}`);
        console.log('   ├─ Ended reason: silence-timed-out');

        if (isDryRun) {
          console.log('   └─ (dry run) would set outcome to no_answer and mark contact pending\n');
        } else {
          attempt.outcome = 'no_answer';
          attempt.updatedAt = new Date().toISOString();

          contactData.status = recomputeContactStatus(contactData);

          console.log(`   └─ ✅ Updated outcome to no_answer (contact status: ${contactData.status})\n`);
          updated++;
        }
      }
    } catch (error) {
      console.error(`   ❌ Failed to fetch call ${callId}: ${error.message}`);
      errored++;
    }

    if (index < candidates.length - 1) {
      await new Promise(resolve => setTimeout(resolve, CALL_DELAY_MS));
    }
  }

  if (!isDryRun && updated > 0) {
    saveContacted(contacted);
    console.log('\n💾 Saved contacted.json with retrofixes.');
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`📊 Inspected: ${inspected}`);
  console.log(`✅ Updated: ${updated}${isDryRun ? ' (dry run)' : ''}`);
  console.log(`❌ API errors: ${errored}`);
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});


