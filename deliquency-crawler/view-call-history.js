#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONTACTED_FILE = path.join(__dirname, 'contacted.json');
const CONTACTS_FILE = path.join(__dirname, 'contacts.json');

/**
 * View call history with detailed information
 */
function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📞 Call History Viewer');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (!fs.existsSync(CONTACTED_FILE)) {
    console.log('❌ No contacted.json file found');
    console.log('💡 Run batch-caller.js first to make some calls\n');
    return;
  }

  const contacted = JSON.parse(fs.readFileSync(CONTACTED_FILE, 'utf8'));
  const contacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));

  // Build a map of contact IDs to contact info
  const contactMap = {};
  for (const [address, data] of Object.entries(contacts)) {
    for (const contact of data.contacts) {
      contactMap[contact.contact_id] = {
        ...contact,
        propertyAddress: address
      };
    }
  }

  const contactIds = Object.keys(contacted);
  
  if (contactIds.length === 0) {
    console.log('📭 No calls made yet\n');
    return;
  }

  console.log(`📊 Total contacts with call attempts: ${contactIds.length}\n`);

  // Group by status
  const byStatus = {
    reached: [],
    pending: []
  };

  for (const contactId of contactIds) {
    const status = contacted[contactId].status || 'pending';
    byStatus[status].push(contactId);
  }

  console.log(`✅ Reached: ${byStatus.reached.length}`);
  console.log(`⏳ Pending: ${byStatus.pending.length}\n`);

  // Show filter options
  const filter = process.argv[2] || 'all';
  
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Showing: ${filter === 'reached' ? '✅ REACHED' : filter === 'pending' ? '⏳ PENDING' : '📋 ALL'}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  let displayIds = contactIds;
  if (filter === 'reached') {
    displayIds = byStatus.reached;
  } else if (filter === 'pending') {
    displayIds = byStatus.pending;
  }

  // Display each contact's history
  displayIds.forEach((contactId, index) => {
    const history = contacted[contactId];
    const contactInfo = contactMap[contactId];
    
    if (!contactInfo) {
      console.log(`⚠️  Contact ${contactId} not found in contacts.json\n`);
      return;
    }

    const statusIcon = history.status === 'reached' ? '✅' : '⏳';
    
    console.log(`${index + 1}. ${statusIcon} ${contactInfo.name}`);
    console.log(`   Property: ${contactInfo.propertyAddress}`);
    console.log(`   Status: ${history.status.toUpperCase()}`);
    console.log(`   Total Attempts: ${history.attempts.length}`);
    console.log(`   Last Attempt: ${new Date(history.lastAttempt).toLocaleString()}`);
    console.log('');
    
    // Show each attempt
    history.attempts.forEach((attempt, i) => {
      const outcomeIcons = {
        'answered': '✅',
        'voicemail': '📫',
        'no_answer': '📵',
        'busy': '📞',
        'invalid_number': '❌',
        'failed': '❌'
      };
      
      const icon = outcomeIcons[attempt.outcome] || '❓';
      
      console.log(`   Attempt #${i + 1}:`);
      console.log(`     ${icon} ${attempt.outcome.replace('_', ' ').toUpperCase()}`);
      console.log(`     📱 Phone: ${attempt.phone}`);
      console.log(`     🕐 Time: ${new Date(attempt.timestamp).toLocaleString()}`);
      
      if (attempt.vapiCallId) {
        console.log(`     📋 Call ID: ${attempt.vapiCallId}`);
        console.log(`     🔗 Review: ${attempt.vapiDashboardUrl}`);
      }
      console.log('');
    });
    
    console.log('---\n');
  });

  console.log('═══════════════════════════════════════════════════════════');
  console.log('Usage:');
  console.log('  node view-call-history.js          # Show all');
  console.log('  node view-call-history.js reached  # Show only reached');
  console.log('  node view-call-history.js pending  # Show only pending');
  console.log('═══════════════════════════════════════════════════════════\n');
}

main();







