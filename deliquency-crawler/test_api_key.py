#!/usr/bin/env python3
"""
Quick script to test if the API key is being loaded correctly
"""

import os
from pathlib import Path
from dotenv import load_dotenv
import requests

# Load environment variables from .env file in the git root
root_dir = Path(__file__).parent.parent
env_path = root_dir / '.env'

print("="*60)
print("DEALMACHINE API KEY DIAGNOSTIC")
print("="*60)

print(f"\n1. Looking for .env file at: {env_path}")
print(f"   File exists: {env_path.exists()}")

if env_path.exists():
    with open(env_path, 'r') as f:
        content = f.read()
        print(f"   File size: {len(content)} bytes")
        if 'DEALMACHINE_API_KEY' in content:
            print(f"   ✓ Contains DEALMACHINE_API_KEY")
        else:
            print(f"   ✗ Does NOT contain DEALMACHINE_API_KEY")

load_dotenv(dotenv_path=env_path)

API_KEY = os.getenv('DEALMACHINE_API_KEY')

print(f"\n2. API Key from environment:")
if API_KEY:
    print(f"   ✓ API Key loaded successfully")
    print(f"   Length: {len(API_KEY)} characters")
    print(f"   First 4 chars: '{API_KEY[:4]}'")
    print(f"   Last 4 chars: '{API_KEY[-4:]}'")
    print(f"   Contains whitespace: {repr(API_KEY) if (' ' in API_KEY or '\n' in API_KEY or '\t' in API_KEY) else 'No'}")
    print(f"   Stripped equals original: {API_KEY.strip() == API_KEY}")
    
    # Clean the API key
    API_KEY = API_KEY.strip()
    
    # Test the actual API call
    print(f"\n3. Testing API GET request:")
    url = 'https://api.dealmachine.com/public/v1/leads'
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json'
    }
    
    print(f"   URL: {url}")
    print(f"   Authorization header: Bearer {API_KEY[:4]}...{API_KEY[-4:]}")
    
    # Try a GET request first (simpler than POST)
    params = {'limit': 1, 'after': 0}
    
    try:
        response = requests.get(url, headers=headers, params=params, timeout=10)
        
        print(f"\n   Response Status Code: {response.status_code}")
        
        try:
            response_json = response.json()
            print(f"   Response JSON:")
            import json
            print(json.dumps(response_json, indent=4))
            
            if response_json.get('error'):
                error = response_json['error']
                print(f"\n   ❌ ERROR: {error.get('message')}")
                print(f"   Error code: {error.get('code')}")
                
                if error.get('code') == 100:
                    print(f"\n   🔍 API KEY ISSUE DETECTED!")
                    print(f"   Your API key appears to be invalid.")
                    print(f"   Please verify:")
                    print(f"   1. Go to DealMachine > Automation > API Docs")
                    print(f"   2. Copy the EXACT API key shown")
                    print(f"   3. Paste it in .env file as: DEALMACHINE_API_KEY=your_key_here")
                    print(f"   4. Make sure there are NO quotes, NO spaces, NO newlines")
            else:
                print(f"\n   ✓ API call successful!")
        except:
            print(f"   Response text: {response.text}")
            
    except Exception as e:
        print(f"\n   ✗ Request failed with exception: {e}")
    
else:
    print("   ✗ API Key NOT found")
    print("\n   Please create a .env file at:")
    print(f"   {env_path}")
    print("\n   With the content:")
    print("   DEALMACHINE_API_KEY=your_api_key_here")
    print("\n   Get your API key from:")
    print("   DealMachine > Automation > API Docs")

print("\n" + "="*60)

