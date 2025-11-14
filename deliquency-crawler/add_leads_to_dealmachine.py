#!/usr/bin/env python3
"""
Script to add leads from deduplicated delinquent taxes data to DealMachine API
and record the responses in an output JSON file.

SETUP:
------
1. Install dependencies:
   source venv/bin/activate
   pip install -r requirements.txt

2. Create a .env file with your API key:
   DEALMACHINE_API_KEY=your_api_key_here

USAGE:
------
# Process first 10 leads (default):
python add_leads_to_dealmachine.py

# Process first 50 leads:
python add_leads_to_dealmachine.py --max-leads 50

# Process ALL leads:
python add_leads_to_dealmachine.py --max-leads all

# Specify custom input file:
python add_leads_to_dealmachine.py --input custom_leads.json

# Specify custom output file:
python add_leads_to_dealmachine.py --output my_responses.json

# Combine options:
python add_leads_to_dealmachine.py --max-leads 100 --input leads.json --output results.json

# Adjust delay between requests (in seconds, default is 1):
python add_leads_to_dealmachine.py --max-leads 50 --delay 0.5

EXAMPLES:
---------
# Test with just 1 lead:
python add_leads_to_dealmachine.py --max-leads 1

# Process top 25 highest-value leads:
python add_leads_to_dealmachine.py --max-leads 25

# Process all leads with 2 second delay between requests:
python add_leads_to_dealmachine.py --max-leads all --delay 2
"""

import requests
import json
import time
import re
import os
import argparse
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file in the git root (one directory up)
root_dir = Path(__file__).parent.parent
env_path = root_dir / '.env'
load_dotenv(dotenv_path=env_path)

# Configuration
API_KEY = os.getenv('DEALMACHINE_API_KEY')
if API_KEY:
    API_KEY = API_KEY.strip()  # Remove any whitespace/newlines
API_URL = 'https://api.dealmachine.com/public/v1/leads'  # Public API endpoint


def parse_arguments():
    """
    Parse command-line arguments.
    """
    parser = argparse.ArgumentParser(
        description='Add delinquent tax leads to DealMachine',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s --max-leads 1           # Test with 1 lead
  %(prog)s --max-leads 50          # Process 50 leads
  %(prog)s --max-leads all         # Process all leads
  %(prog)s --max-leads 100 --delay 2  # 100 leads with 2 sec delay
        """
    )
    
    parser.add_argument(
        '--max-leads',
        type=str,
        default='10',
        help='Number of leads to process (default: 10, use "all" for all leads)'
    )
    
    parser.add_argument(
        '--input',
        type=str,
        default='delinquent_taxes_deduplicated.json',
        help='Input JSON file with deduplicated leads (default: delinquent_taxes_deduplicated.json)'
    )
    
    parser.add_argument(
        '--output',
        type=str,
        default='dealmachine_responses.json',
        help='Output JSON file for API responses (default: dealmachine_responses.json)'
    )
    
    parser.add_argument(
        '--delay',
        type=float,
        default=1.0,
        help='Delay between API requests in seconds (default: 1.0)'
    )
    
    args = parser.parse_args()
    
    # Parse max_leads (handle "all" or numeric value)
    if args.max_leads.lower() == 'all':
        args.max_leads = None
    else:
        try:
            args.max_leads = int(args.max_leads)
        except ValueError:
            parser.error(f'--max-leads must be a number or "all", got: {args.max_leads}')
    
    return args


def parse_address(address_string):
    """
    Parse the address string into components.
    Examples: 
      - "4390 SW 20TH AVE GAINESVILLE, FL 32607"
      - "10491 72ND ST SEMINOLE FL  33777-1500"
      - "1423 ALLENDALE RD/ WEST PALM BEACH FL 33405"
    """
    try:
        # First, try to extract zip code (5 digits, possibly with -xxxx)
        # Look for it at the end of the string
        zip_match = re.search(r'\b(\d{5}(?:-\d{4})?)\s*$', address_string)
        zip_code = zip_match.group(1) if zip_match else ''
        
        # Remove the zip from the string for further parsing
        if zip_code:
            address_without_zip = address_string[:zip_match.start()].strip()
        else:
            address_without_zip = address_string
        
        # Try to extract state (2 letter code, typically right before zip)
        state_match = re.search(r'\b([A-Z]{2})\s*$', address_without_zip)
        state = state_match.group(1) if state_match else ''
        
        # Remove state from string
        if state:
            address_without_state = address_without_zip[:state_match.start()].strip()
        else:
            address_without_state = address_without_zip
        
        if state and zip_code:
            # Now parse city and street address
            # Look for common street indicators to find where street ends
            street_indicators = ['ST', 'STREET', 'AVE', 'AVENUE', 'ROAD', 'RD', 'BLVD', 
                               'BOULEVARD', 'LANE', 'LN', 'DR', 'DRIVE', 'CT', 'COURT', 
                               'WAY', 'PL', 'PLACE', 'PKWY', 'PARKWAY', 'CIR', 'CIRCLE',
                               'TER', 'TERRACE', 'HWY', 'HIGHWAY']
            
            # Check if there's a comma separating street and city
            if ',' in address_without_state:
                parts = address_without_state.split(',', 1)
                street_address = parts[0].strip()
                city = parts[1].strip()
            elif '/' in address_without_state:
                # Handle addresses with / separator (like "RD/ WEST PALM BEACH")
                parts = address_without_state.split('/', 1)
                street_address = parts[0].strip()
                city = parts[1].strip()
            else:
                # No comma or slash - need to split by finding street indicator
                words = address_without_state.split()
                street_end_idx = None
                
                for idx, word in enumerate(words):
                    # Check if this word or next word is a street indicator
                    word_upper = word.rstrip('.').upper()
                    if word_upper in street_indicators:
                        street_end_idx = idx + 1
                        break
                
                if street_end_idx and street_end_idx < len(words):
                    street_address = ' '.join(words[:street_end_idx])
                    city = ' '.join(words[street_end_idx:])
                else:
                    # Fallback: assume last 1-2 words are city
                    if len(words) > 3:
                        street_address = ' '.join(words[:-2])
                        city = ' '.join(words[-2:])
                    elif len(words) > 1:
                        street_address = ' '.join(words[:-1])
                        city = words[-1]
                    else:
                        street_address = address_without_state
                        city = ''
            
            return {
                'address': street_address,
                'city': city,
                'state': state,
                'zip': zip_code
            }
        else:
            # Couldn't parse properly, return full address
            return {
                'address': address_string,
                'city': '',
                'state': '',
                'zip': ''
            }
    except Exception as e:
        print(f"Error parsing address '{address_string}': {e}")
        return {
            'address': address_string,
            'city': '',
            'state': '',
            'zip': ''
        }


def format_lead(entry):
    """
    Format a delinquent tax entry into a DealMachine lead format.
    """
    # Parse the address
    address_parts = parse_address(entry['Location Address'])
    
    # Build the lead object
    lead = {
        'address': address_parts['address'],
        'city': address_parts['city'],
        'state': address_parts['state'],
        'zip': address_parts['zip'],
        'owner_name': entry['Owner Name'],
    }
    
    # Add optional fields if available
    if entry.get('DBA/Business Name'):
        lead['business_name'] = entry['DBA/Business Name']
    
    # Add custom notes about the delinquent taxes
    notes = f"Delinquent Tax Lead - County: {entry['County']}\n"
    notes += f"Total Warrant Amount: ${entry['Total Warrant Amount']:,.2f}\n"
    notes += f"Number of Warrants: {entry['Number of Warrants']}\n"
    notes += f"Warrant Numbers: {', '.join(map(str, entry['Warrant Numbers']))}"
    
    lead['notes'] = notes
    
    return lead


def add_leads_to_dealmachine(input_file, output_file, max_leads=None, delay=1.0):
    """
    Read leads from input file, send to DealMachine API, and save responses.
    
    Args:
        input_file: Path to JSON file with leads
        output_file: Path to save API responses
        max_leads: Number of leads to process (None for all)
        delay: Seconds to wait between API requests
    """
    # Headers for API authentication
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'application/json'
    }
    
    # Read the deduplicated data
    print(f"Reading leads from {input_file}...")
    with open(input_file, 'r', encoding='utf-8') as f:
        delinquent_taxes = json.load(f)
    
    # Limit the number of leads if specified
    if max_leads:
        leads_to_process = delinquent_taxes[:max_leads]
        print(f"Processing {max_leads} leads out of {len(delinquent_taxes)} total leads")
    else:
        leads_to_process = delinquent_taxes
        print(f"Processing all {len(delinquent_taxes)} leads")
    
    # Store responses
    responses = []
    success_count = 0
    error_count = 0
    
    # Process each lead
    for idx, entry in enumerate(leads_to_process, 1):
        print(f"\n[{idx}/{len(leads_to_process)}] Processing: {entry['Owner Name']}")
        
        try:
            # Format the lead
            lead_data = format_lead(entry)
            
            # Send POST request to DealMachine API
            response = requests.post(API_URL, headers=headers, json=lead_data, timeout=30)
            
            # Parse response
            try:
                response_data = response.json()
            except:
                response_data = {'raw_response': response.text}
            
            # Record the result
            result = {
                'index': idx,
                'timestamp': datetime.now().isoformat(),
                'original_entry': entry,
                'formatted_lead': lead_data,
                'status_code': response.status_code,
                'response': response_data,
                'success': 200 <= response.status_code < 300
            }
            
            responses.append(result)
            
            if result['success']:
                success_count += 1
                print(f"✓ Success (Status: {response.status_code})")
            else:
                error_count += 1
                print(f"✗ Error (Status: {response.status_code}): {response_data}")
            
        except Exception as e:
            error_count += 1
            print(f"✗ Exception: {e}")
            
            result = {
                'index': idx,
                'timestamp': datetime.now().isoformat(),
                'original_entry': entry,
                'formatted_lead': format_lead(entry) if entry else None,
                'status_code': None,
                'response': {'error': str(e)},
                'success': False
            }
            responses.append(result)
        
        # Rate limiting - wait between requests
        if idx < len(leads_to_process):
            time.sleep(delay)
    
    # Save all responses to output file
    print(f"\n\nSaving responses to {output_file}...")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump({
            'summary': {
                'total_processed': len(leads_to_process),
                'successful': success_count,
                'failed': error_count,
                'timestamp': datetime.now().isoformat()
            },
            'responses': responses
        }, f, indent=2, ensure_ascii=False)
    
    # Print summary
    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)
    print(f"Total Leads Processed: {len(leads_to_process)}")
    print(f"Successful: {success_count}")
    print(f"Failed: {error_count}")
    print(f"Success Rate: {(success_count/len(leads_to_process)*100):.1f}%")
    print(f"\nResponses saved to: {output_file}")
    print("="*60)


if __name__ == '__main__':
    # Parse command-line arguments
    args = parse_arguments()
    
    # Debug: Print API key status (first/last 4 chars only for security)
    if API_KEY:
        masked_key = f"{API_KEY[:4]}...{API_KEY[-4:]}" if len(API_KEY) > 8 else "***"
        print(f"✓ API Key loaded: {masked_key}")
    
    # Check if API key is set
    if not API_KEY:
        print("⚠️  WARNING: DealMachine API key not found!")
        print("\nPlease create a .env file in the project root (syslink/) with:")
        print("   DEALMACHINE_API_KEY=your_api_key_here")
        print("\nTo get your API key:")
        print("   1. Log into DealMachine")
        print("   2. Go to Profile > Application Settings > API")
        print("   3. Copy your API key")
        print("\nFor now, the script will continue in DRY RUN mode (no actual API calls)...")
        
        # Dry run - show what would be sent
        print("\n" + "="*60)
        print("DRY RUN - Sample Lead Format")
        print("="*60)
        
        with open(args.input, 'r', encoding='utf-8') as f:
            sample_data = json.load(f)
        
        if sample_data:
            sample_lead = format_lead(sample_data[0])
            print(json.dumps(sample_lead, indent=2))
            print("\nThis is what will be sent to DealMachine for the first lead.")
            print("Set your API key and re-run to actually add leads.")
    else:
        add_leads_to_dealmachine(args.input, args.output, args.max_leads, args.delay)

