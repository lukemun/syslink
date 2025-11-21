#!/usr/bin/env tsx
import * as dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync } from 'fs';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from parent directory
dotenv.config({ path: resolve(__dirname, '../.env') });

const ASSISTANT_ID = '9f56ad7a-9975-4e7b-ad51-13e7fb509ded';

async function fetchAssistant() {
  console.log('🔍 Fetching assistant configuration...');
  
  try {
    const response = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const assistant = await response.json();
    
    // Save to file
    writeFileSync(
      resolve(__dirname, 'current-assistant-config.json'),
      JSON.stringify(assistant, null, 2)
    );
    
    console.log('✅ Assistant configuration saved to current-assistant-config.json');
    console.log('\n📋 Assistant details:');
    console.log('   - Name:', assistant.name);
    console.log('   - ID:', assistant.id);
    console.log('   - Model:', assistant.model?.provider);
    console.log('   - Voice:', assistant.voice?.provider);
    
    return assistant;
  } catch (error: any) {
    console.error('❌ Error fetching assistant:', error.message);
    throw error;
  }
}

fetchAssistant().catch(console.error);







