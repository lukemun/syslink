#!/usr/bin/env python3
"""
Convert delinquent taxes JSON to DealMachine-compatible CSV format.
Uses usaddress library for reliable US address parsing.
"""

import json
import csv
import re
from pathlib import Path

try:
    import usaddress
    USADDRESS_AVAILABLE = True
except ImportError:
    USADDRESS_AVAILABLE = False
    print("Warning: usaddress library not found. Install with: pip install usaddress")
    print("Falling back to regex-based parsing (less accurate)\n")


def parse_address_with_usaddress(location_address):
    """
    Parse address using usaddress library (machine learning based).
    Returns dict with: street, city, state, zip_code
    """
    if not location_address or not isinstance(location_address, str):
        return {
            'street': '',
            'city': '',
            'state': '',
            'zip_code': ''
        }
    
    # Clean up the address
    address = location_address.strip()
    address = address.replace('/', ',')
    address = re.sub(r'\s+', ' ', address)
    
    try:
        # Parse the address - usaddress returns a list of (value, label) tuples
        parsed, address_type = usaddress.tag(address)
        
        # Build street address from various components
        street_parts = []
        
        # Address number and street name components
        for component in ['AddressNumber', 'StreetNamePreDirectional', 'StreetNamePreModifier', 
                         'StreetName', 'StreetNamePostType', 'StreetNamePostDirectional',
                         'SubaddressType', 'SubaddressIdentifier', 'OccupancyType', 'OccupancyIdentifier']:
            if component in parsed:
                street_parts.append(parsed[component])
        
        street = ' '.join(street_parts).strip()
        
        # Get city
        city = parsed.get('PlaceName', '')
        
        # Get state
        state = parsed.get('StateName', 'FL')
        
        # Get zip code
        zip_code = parsed.get('ZipCode', '')
        
        # Fix edge case: if state is not a 2-letter code, it might be part of city
        # (e.g., "BOCA RATON" parsed as city="BOCA", state="RATON")
        if state and len(state) > 2:
            # State should only be 2 characters, so this is likely part of city name
            if city:
                city = f"{city} {state}"
            else:
                city = state
            state = 'FL'  # Default to FL for this dataset
        
        # Clean up - remove commas, periods, parentheses per DealMachine requirements
        street = re.sub(r'[,.()*]', '', street).strip()
        city = re.sub(r'[,.()*]', '', city).strip()
        state = re.sub(r'[,.()*]', '', state).strip()
        zip_code = re.sub(r'[,.()*]', '', zip_code).strip() if zip_code else ''
        
        return {
            'street': street,
            'city': city,
            'state': state,
            'zip_code': zip_code
        }
    
    except Exception as e:
        # If usaddress fails, fall back to regex parsing
        print(f"Warning: usaddress failed for '{location_address[:50]}...': {e}")
        return parse_address_regex(location_address)


def parse_address_regex(location_address):
    """
    Fallback regex-based address parsing.
    Returns dict with: street, city, state, zip_code
    """
    if not location_address or not isinstance(location_address, str):
        return {
            'street': '',
            'city': '',
            'state': '',
            'zip_code': ''
        }
    
    address = location_address.strip()
    address = address.replace('/', ',')
    address = re.sub(r'\s+', ' ', address)
    
    # Extract zip code
    zip_match = re.search(r'\b(\d{5}(?:-\d{4})?)\b', address)
    zip_code = zip_match.group(1) if zip_match else ''
    
    if zip_match:
        address_without_zip = address[:zip_match.start()].strip()
    else:
        address_without_zip = address
    
    # Extract state
    state_match = re.search(r'\b([A-Z]{2})\s*[,.]?\s*$', address_without_zip)
    state = state_match.group(1) if state_match else 'FL'
    
    if state_match:
        address_without_state = address_without_zip[:state_match.start()].strip()
    else:
        address_without_state = address_without_zip
    
    address_without_state = re.sub(r'[,.]+\s*$', '', address_without_state).strip()
    
    # Split by comma for city
    if ',' in address_without_state:
        parts = [p.strip() for p in address_without_state.split(',')]
        parts = [p for p in parts if p]
        
        if len(parts) >= 2:
            city = parts[-1]
            street = ' '.join(parts[:-1])
        else:
            street = parts[0] if parts else ''
            city = ''
    else:
        street = address_without_state
        city = ''
    
    street = re.sub(r'[,.()*]', '', street).strip()
    city = re.sub(r'[,.()*]', '', city).strip()
    
    return {
        'street': street,
        'city': city,
        'state': state,
        'zip_code': zip_code
    }


def parse_address(location_address):
    """
    Main address parsing function - uses usaddress if available, otherwise regex.
    """
    if USADDRESS_AVAILABLE:
        return parse_address_with_usaddress(location_address)
    else:
        return parse_address_regex(location_address)


def validate_and_fix_address(address_parts, original_address):
    """
    Validate and fix common address issues.
    Returns tuple: (fixed_address_parts, is_valid, error_message)
    """
    street = address_parts['street']
    city = address_parts['city']
    state = address_parts['state']
    zip_code = address_parts['zip_code']
    
    errors = []
    
    # Fix zip code issues
    if zip_code:
        # Remove any non-digit characters except hyphen
        zip_clean = ''.join(c for c in zip_code if c.isdigit() or c == '-')
        
        # Handle 6-digit zips (likely missing hyphen)
        if len(zip_clean) == 6 and '-' not in zip_clean:
            zip_clean = f"{zip_clean[:5]}-{zip_clean[5:]}"
        
        # Handle 4-digit zips (missing leading zero)
        elif len(zip_clean) == 4 and '-' not in zip_clean:
            # Try to add leading zero for Florida zips (start with 3)
            if state == 'FL':
                zip_clean = '3' + zip_clean
            else:
                # For other states, we can't reliably fix it
                errors.append(f"Invalid 4-digit zip: {zip_clean}")
        
        # Check zip+4 format if present
        if '-' in zip_clean:
            zip_parts = zip_clean.split('-')
            # Should be exactly 2 parts
            if len(zip_parts) != 2:
                errors.append(f"Invalid zip+4 format (multiple hyphens): {zip_clean}")
            # First part should be 5 digits
            elif len(zip_parts[0]) != 5 or not zip_parts[0].isdigit():
                errors.append(f"Invalid zip format (first part): {zip_clean}")
            # Second part should be 4 digits (if present, could be truncated)
            elif zip_parts[1]:
                # If second part is less than 4 digits, truncate the zip+4 to just zip
                if len(zip_parts[1]) < 4:
                    zip_clean = zip_parts[0]  # Just use the 5-digit zip
                elif len(zip_parts[1]) != 4 or not zip_parts[1].isdigit():
                    errors.append(f"Invalid zip+4 format (second part): {zip_clean}")
        else:
            # No hyphen - check if it's a valid 5-digit zip
            if len(zip_clean) != 5 or not zip_clean.isdigit():
                errors.append(f"Invalid zip format: {zip_clean}")
        
        zip_code = zip_clean
    
    # Check for non-US addresses (Canadian postal codes have letters)
    if state in ['ON', 'BC', 'AB', 'QC', 'MB', 'SK', 'NS', 'NB', 'PE', 'NL', 'YT', 'NT', 'NU']:
        errors.append(f"Non-US address (Canadian province: {state})")
        return (address_parts, False, '; '.join(errors))
    
    # Check if zip looks like a Canadian postal code (has letters)
    if zip_code and any(c.isalpha() for c in zip_code):
        errors.append(f"Canadian/non-US postal code: {zip_code}")
        return (address_parts, False, '; '.join(errors))
    
    # Validate required fields for DealMachine
    # According to docs, you need either:
    # 1. Full address (street, city, state, zip) OR
    # 2. Parcel ID + County + State
    # Since we don't have parcel IDs, we need full addresses
    
    has_full_address = street and city and state and zip_code
    has_county_fallback = address_parts.get('county') and state and zip_code
    
    # Track what's missing
    if not street and address_parts.get('county'):
        # If we have county but no street, check if we have city+state+zip
        has_minimum = city and state and zip_code
    else:
        # Otherwise we need complete address info
        has_minimum = has_full_address or has_county_fallback
        
        if not has_full_address:
            if not street:
                errors.append("Missing street address")
            if not city:
                errors.append("Missing city")
            if not zip_code:
                errors.append("Missing zip code")
    
    # Return fixed address
    fixed_parts = {
        'street': street,
        'city': city,
        'state': state,
        'zip_code': zip_code
    }
    
    # Must have full address info to be valid AND no validation errors
    is_valid = (has_full_address or (has_county_fallback and state)) and len(errors) == 0
    
    return (fixed_parts, is_valid, '; '.join(errors) if errors else '')


def convert_json_to_csv(json_file_path, output_csv_path):
    """
    Convert JSON file to DealMachine-compatible CSV.
    """
    # Read JSON data
    with open(json_file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"Loaded {len(data)} records from {json_file_path}")
    
    # Prepare CSV data
    csv_rows = []
    skipped_rows = []
    
    for record in data:
        original_address = record.get('Location Address', '')
        
        # Parse the address
        address_parts = parse_address(original_address)
        
        # Add county to address parts for validation
        address_parts['county'] = record.get('County', '')
        
        # Validate and fix the address
        fixed_parts, is_valid, error_msg = validate_and_fix_address(address_parts, original_address)
        
        if not is_valid:
            skipped_rows.append({
                'original': original_address,
                'reason': error_msg,
                'owner': record.get('Owner Name', ''),
                'county': record.get('County', ''),
                'amount': record.get('Total Warrant Amount', ''),
                'warrants': record.get('Number of Warrants', '')
            })
            continue
        
        # Create CSV row according to DealMachine format
        csv_row = {
            'Address Line 1': fixed_parts['street'],
            'City': fixed_parts['city'],
            'State': fixed_parts['state'],
            'Zip Code': fixed_parts['zip_code'],
            'County': record.get('County', ''),
            'Owner Name': record.get('Owner Name', ''),
            'DBA Business Name': record.get('DBA/Business Name', '') or '',
            'Total Warrant Amount': record.get('Total Warrant Amount', ''),
            'Number of Warrants': record.get('Number of Warrants', ''),
            'Original Address': original_address  # Keep for reference
        }
        
        # Only add rows that have at least an address or county
        if csv_row['Address Line 1'] or csv_row['County']:
            csv_rows.append(csv_row)
    
    # Write valid rows to CSV
    if csv_rows:
        fieldnames = [
            'Address Line 1',
            'City',
            'State',
            'Zip Code',
            'County',
            'Owner Name',
            'DBA Business Name',
            'Total Warrant Amount',
            'Number of Warrants',
            'Original Address'
        ]
        
        with open(output_csv_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(csv_rows)
        
        print(f"Successfully created {output_csv_path}")
        print(f"Total rows written: {len(csv_rows)}")
        
        # Write skipped rows to a separate log file
        if skipped_rows:
            skipped_log_path = output_csv_path.parent / 'dealmachine_import_skipped.csv'
            
            skipped_fieldnames = [
                'Original Address',
                'Error Reason',
                'Owner Name',
                'County',
                'Total Warrant Amount',
                'Number of Warrants'
            ]
            
            with open(skipped_log_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=skipped_fieldnames)
                writer.writeheader()
                for skip in skipped_rows:
                    writer.writerow({
                        'Original Address': skip['original'],
                        'Error Reason': skip['reason'],
                        'Owner Name': skip.get('owner', ''),
                        'County': skip.get('county', ''),
                        'Total Warrant Amount': skip.get('amount', ''),
                        'Number of Warrants': skip.get('warrants', '')
                    })
            
            print(f"\n⚠️  Skipped {len(skipped_rows)} rows with issues")
            print(f"📄 Skipped records saved to: {skipped_log_path.name}")
            print(f"\nFirst 5 skipped records:")
            for skip in skipped_rows[:5]:  # Show first 5
                print(f"  - {skip['original'][:70]}")
                print(f"    Reason: {skip['reason']}")
            if len(skipped_rows) > 5:
                print(f"  ... and {len(skipped_rows) - 5} more (see {skipped_log_path.name})")
        
        # Print sample rows for verification
        print("\nSample rows (first 3):")
        for i, row in enumerate(csv_rows[:3], 1):
            print(f"\nRow {i}:")
            print(f"  Street: {row['Address Line 1']}")
            print(f"  City: {row['City']}")
            print(f"  State: {row['State']}")
            print(f"  Zip: {row['Zip Code']}")
            print(f"  County: {row['County']}")
            print(f"  Owner: {row['Owner Name']}")
    else:
        print("No valid records found to write to CSV")


def main():
    # Define file paths
    script_dir = Path(__file__).parent
    json_file = script_dir / 'delinquent_taxes_deduplicated.json'
    output_csv = script_dir / 'dealmachine_import.csv'
    
    # Check if input file exists
    if not json_file.exists():
        print(f"Error: Input file not found: {json_file}")
        return
    
    # Convert
    convert_json_to_csv(json_file, output_csv)
    
    print(f"\n✓ Conversion complete!")
    print(f"  Input:  {json_file}")
    print(f"  Output: {output_csv}")
    print(f"\nYou can now upload {output_csv.name} to DealMachine.")


if __name__ == '__main__':
    main()

