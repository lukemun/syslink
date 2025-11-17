#!/usr/bin/env tsx
/**
 * Cold Caller - Make outbound calls via Vapi
 * 
 * Usage:
 *   npx tsx make-call.ts                  # Make a call with environment variables
 *   npx tsx make-call.ts --dry-run        # Dry run: log all variables without calling
 *   DRY_RUN=true npx tsx make-call.ts     # Alternative dry run syntax
 * 
 * Environment Variables:
 *   Required:
 *     - VAPI_API_KEY
 *     - PROPERTY_ADDRESS
 *     - PROPERTY_CITY
 *     - FIRST_NAME
 *   
 *   Optional (with defaults):
 *     - VAPI_PHONE_NUMBER_ID
 *     - VAPI_ASSISTANT_ID
 *     - TARGET_PHONE_NUMBER
 *     - CALL_BACK_NUMBER
 *     - AGENT_NAME
 *     - CLOSER_NAME
 *     - TIME1
 *     - TIME2
 */
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import streetSuffix from 'street-suffix';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from parent directory
dotenv.config({ path: resolve(__dirname, '../.env') });

// Environment variables
const VAPI_API_KEY = process.env.VAPI_API_KEY!;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID || '1cacb379-9cbe-408e-9ba2-c1a2134fd05d';
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || '9f56ad7a-9975-4e7b-ad51-13e7fb509ded';
let TARGET_PHONE_NUMBER = process.env.TARGET_PHONE_NUMBER || '+16504006400';
const CALL_BACK_NUMBER = '16464923788';
const AGENT_NAME = process.env.AGENT_NAME || 'Elliot';
const CLOSER_NAME = process.env.CLOSER_NAME || 'Michael';
const PROPERTY_ADDRESS = process.env.PROPERTY_ADDRESS!;
const PROPERTY_CITY = process.env.PROPERTY_CITY!;
const FIRST_NAME = process.env.FIRST_NAME!;
const TIME1 = process.env.TIME1 || '2:00 PM';
const TIME2 = process.env.TIME2 || '4:30 PM';

// Create short address (street only, no city/state/zip) and expand suffixes for speech
const SHORT_ADDRESS = createShortAddress(PROPERTY_ADDRESS);

// Testing override
// TARGET_PHONE_NUMBER = '+16504006400';

function createShortAddress(fullAddress?: string): string {
  if (!fullAddress) {
    return '';
  }

  const [streetLine = ''] = fullAddress.split(',');
  const trimmedStreetLine = streetLine.trim();

  if (!trimmedStreetLine) {
    return '';
  }

  return expandStreetSuffixForSpeech(trimmedStreetLine);
}

function expandStreetSuffixForSpeech(streetLine: string): string {
  const tokens = streetLine.split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return streetLine;
  }

  const suffixIndex = tokens.length - 1;
  const suffixToken = tokens[suffixIndex];
  const match = suffixToken.match(/^([A-Za-z]+)([^A-Za-z]*)$/);

  if (!match) {
    return streetLine;
  }

  const [, baseSuffix, trailing = ''] = match;
  const expanded = streetSuffix.expand(baseSuffix);

  if (!expanded) {
    return streetLine;
  }

  const readableSuffix = expanded.charAt(0) + expanded.slice(1).toLowerCase();
  tokens[suffixIndex] = `${readableSuffix}${trailing}`;

  return tokens.join(' ');
}

interface CallConfig {
  vapiApiKey: string;
  phoneNumberId: string;
  assistantId: string;
  targetNumber: string;
  callBackNumber: string;
  variableValues: {
    AGENT_NAME: string;
    CLOSER_NAME: string;
    PROPERTY_ADDRESS: string;
    SHORT_ADDRESS: string;
    PROPERTY_CITY: string;
    FIRST_NAME: string;
    TIME1: string;
    TIME2: string;
  };
}

async function makeCall(config: CallConfig) {
  console.log('🚀 Initiating call to:', config.targetNumber);
  console.log('📞 Using assistant ID:', config.assistantId);
  console.log('📋 Variable values:', config.variableValues);
  console.log('📧 Voicemail detection: ENABLED (Vapi provider)');

  try {
    // Make the call with assistant ID and variable overrides
    console.log('\n⏳ Placing call...\n');
    const response = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.vapiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assistantId: config.assistantId,
        assistantOverrides: {
          variableValues: config.variableValues,
          voicemailDetection: {
            provider: 'vapi',
            backoffPlan: {
              startAtSeconds: 0,
              frequencySeconds: 2.5,
              maxRetries: 5,
            },
            beepMaxAwaitSeconds: 25,
          },
          voicemailMessage: `Hi, sorry to bother you, this is ${config.variableValues.AGENT_NAME} with Florida Cash Home Buyers. I was calling about the property at ${config.variableValues.SHORT_ADDRESS}. We'd like to speak with you about a potential offer. Please give us a callback at ${config.callBackNumber}. Again, that's ${config.callBackNumber}. Thanks, and have a great day.`,
        },
        customer: { 
          number: config.targetNumber,
        },
        phoneNumberId: config.phoneNumberId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const call = await response.json();

    console.log('✅ Call initiated successfully!');
    console.log('📊 Call details:');
    console.log('   - Call ID:', call.id);
    console.log('   - Status:', call.status);
    console.log('   - Created at:', call.createdAt);
    console.log('\n🎯 Monitor your call in the Vapi dashboard:');
    console.log(`   https://dashboard.vapi.ai/calls/${call.id}`);
    
    // Output call ID in machine-readable format for batch caller
    console.log('\n__VAPI_CALL_ID__:' + call.id);

    return call;
  } catch (error: any) {
    console.error('❌ Error making call:', error.message);
    if (error.statusCode) {
      console.error('   Status code:', error.statusCode);
    }
    if (error.body) {
      console.error('   Details:', JSON.stringify(error.body, null, 2));
    }
    throw error;
  }
}

// Main execution
async function main() {
  // Check for dry run mode
  const isDryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';

  // Validate required environment variables
  const requiredEnvVars = [
    'VAPI_API_KEY',
    'PROPERTY_ADDRESS',
    'PROPERTY_CITY',
    'FIRST_NAME'
  ];
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0 && !isDryRun) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('\n💡 Please add these variables to /Users/lukemunro/Clones/syslink/.env');
    process.exit(1);
  }

  // Prepare call configuration
  const config: CallConfig = {
    vapiApiKey: VAPI_API_KEY,
    phoneNumberId: VAPI_PHONE_NUMBER_ID,
    assistantId: VAPI_ASSISTANT_ID,
    targetNumber: TARGET_PHONE_NUMBER,
    callBackNumber: CALL_BACK_NUMBER,
    variableValues: {
      AGENT_NAME,
      CLOSER_NAME,
      PROPERTY_ADDRESS,
      SHORT_ADDRESS,
      PROPERTY_CITY,
      FIRST_NAME,
      TIME1,
      TIME2,
    },
  };

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🏠 Florida Cash Home Buyers - Cold Caller');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Dry run mode - log all variables and exit
  if (isDryRun) {
    console.log('🧪 DRY RUN MODE - No calls will be made\n');
    
    console.log('📋 Environment Variables:');
    console.log('─────────────────────────────────────────────────────────\n');
    
    console.log('🔑 API Configuration:');
    console.log(`   VAPI_API_KEY: ${VAPI_API_KEY ? '✓ Set (hidden)' : '✗ Not set'}`);
    console.log(`   VAPI_PHONE_NUMBER_ID: ${VAPI_PHONE_NUMBER_ID}`);
    console.log(`   VAPI_ASSISTANT_ID: ${VAPI_ASSISTANT_ID}`);
    
    console.log('\n📞 Call Configuration:');
    console.log(`   TARGET_PHONE_NUMBER: ${TARGET_PHONE_NUMBER}`);
    console.log(`   CALL_BACK_NUMBER: ${CALL_BACK_NUMBER}`);
    
    console.log('\n👤 Contact Variables:');
    console.log(`   AGENT_NAME: ${AGENT_NAME}`);
    console.log(`   CLOSER_NAME: ${CLOSER_NAME}`);
    console.log(`   FIRST_NAME: ${FIRST_NAME}`);
    
    console.log('\n🏠 Property Variables:');
    console.log(`   PROPERTY_ADDRESS: ${PROPERTY_ADDRESS}`);
    console.log(`   SHORT_ADDRESS: ${SHORT_ADDRESS}`);
    console.log(`   PROPERTY_CITY: ${PROPERTY_CITY}`);
    
    console.log('\n⏰ Time Variables:');
    console.log(`   TIME1: ${TIME1}`);
    console.log(`   TIME2: ${TIME2}`);
    
    console.log('\n─────────────────────────────────────────────────────────');
    console.log('✅ Dry run complete - all variables validated');
    console.log('💡 Remove --dry-run flag to make actual calls\n');
    
    return;
  }

  await makeCall(config);
}

// Run the script
main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});

