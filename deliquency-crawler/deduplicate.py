#!/usr/bin/env python3
"""
Script to deduplicate delinquent_taxes.json by combining entries
with the same owner name and location address.
"""

import json
from collections import defaultdict

def deduplicate_taxes(input_file, output_file):
    # Read the input JSON file
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Dictionary to hold deduplicated data
    # Key: (Owner Name, Location Address)
    # Value: dict with combined data
    deduplicated = defaultdict(lambda: {
        'warrant_numbers': [],
        'total_amount': 0.0,
        'dba_business_name': None,
        'owner_name': None,
        'location_address': None,
        'county': None
    })
    
    # Process each entry
    for entry in data:
        # Create a key based on owner name and location address
        key = (entry['Owner Name'], entry['Location Address'])
        
        # Add warrant number to list
        deduplicated[key]['warrant_numbers'].append(entry['Warrant Number'])
        
        # Sum the amounts
        deduplicated[key]['total_amount'] += entry['Warrant Amount Recorded in the County Records']
        
        # Store the other fields (will be same for all duplicates)
        deduplicated[key]['dba_business_name'] = entry['DBA/Business Name']
        deduplicated[key]['owner_name'] = entry['Owner Name']
        deduplicated[key]['location_address'] = entry['Location Address']
        deduplicated[key]['county'] = entry['County']
    
    # Convert to output format
    output_data = []
    for key, value in deduplicated.items():
        output_data.append({
            'DBA/Business Name': value['dba_business_name'],
            'Owner Name': value['owner_name'],
            'Location Address': value['location_address'],
            'County': value['county'],
            'Warrant Numbers': value['warrant_numbers'],
            'Total Warrant Amount': round(value['total_amount'], 2),
            'Number of Warrants': len(value['warrant_numbers'])
        })
    
    # Sort by total amount descending
    output_data.sort(key=lambda x: x['Total Warrant Amount'], reverse=True)
    
    # Write to output file
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)
    
    # Print summary
    print(f"Original entries: {len(data)}")
    print(f"Deduplicated entries: {len(output_data)}")
    print(f"Duplicates removed: {len(data) - len(output_data)}")
    print(f"\nOutput written to: {output_file}")
    
    # Show top 5 entries
    print("\nTop 5 entries by total amount:")
    for i, entry in enumerate(output_data[:5], 1):
        print(f"{i}. {entry['Owner Name']} - ${entry['Total Warrant Amount']:,.2f} ({entry['Number of Warrants']} warrants)")

if __name__ == '__main__':
    input_file = 'delinquent_taxes.json'
    output_file = 'delinquent_taxes_deduplicated.json'
    
    deduplicate_taxes(input_file, output_file)


