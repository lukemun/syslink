#!/usr/bin/env python3
"""
ACS DP03 Income Data Processor

This script processes American Community Survey (ACS) DP03 data to extract
income-related metrics by ZIP Code Tabulation Area (ZCTA).

Input:  census-acs-income-2023/raw/ACSDP5Y2023.DP03/ACSDP5Y2023.DP03-Data.csv
Output: census-acs-income-2023/processed/acs_income_by_zip_2023.csv
"""

import os
import pandas as pd
from pathlib import Path

# Define paths relative to script location
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
RAW_DATA_DIR = PROJECT_DIR / 'raw' / 'ACSDP5Y2023.DP03'
PROCESSED_DIR = PROJECT_DIR / 'processed'

# Input files
DATA_CSV = RAW_DATA_DIR / 'ACSDP5Y2023.DP03-Data.csv'
METADATA_CSV = RAW_DATA_DIR / 'ACSDP5Y2023.DP03-Column-Metadata.csv'

# Output file
OUTPUT_CSV = PROCESSED_DIR / 'acs_income_by_zip_2023.csv'

# Define all income-related columns to extract (estimates and margins of error)
INCOME_COLUMNS = [
    # Geography columns (always needed)
    'GEO_ID', 'NAME',
    
    # Household income distribution
    'DP03_0051E', 'DP03_0051M',  # Total households
    'DP03_0052E', 'DP03_0052M',  # < $10k
    'DP03_0053E', 'DP03_0053M',  # $10k-$14,999
    'DP03_0054E', 'DP03_0054M',  # $15k-$24,999
    'DP03_0055E', 'DP03_0055M',  # $25k-$34,999
    'DP03_0056E', 'DP03_0056M',  # $35k-$49,999
    'DP03_0057E', 'DP03_0057M',  # $50k-$74,999
    'DP03_0058E', 'DP03_0058M',  # $75k-$99,999
    'DP03_0059E', 'DP03_0059M',  # $100k-$149,999
    'DP03_0060E', 'DP03_0060M',  # $150k-$199,999
    'DP03_0061E', 'DP03_0061M',  # $200k+
    
    # Household income summary statistics
    'DP03_0062E', 'DP03_0062M',  # Median household income
    'DP03_0063E', 'DP03_0063M',  # Mean household income
    
    # Household income sources
    'DP03_0064E', 'DP03_0064M',  # Households with earnings
    'DP03_0065E', 'DP03_0065M',  # Mean earnings
    'DP03_0066E', 'DP03_0066M',  # Households with Social Security
    'DP03_0067E', 'DP03_0067M',  # Mean Social Security income
    'DP03_0068E', 'DP03_0068M',  # Households with retirement income
    'DP03_0069E', 'DP03_0069M',  # Mean retirement income
    'DP03_0070E', 'DP03_0070M',  # Households with SSI
    'DP03_0071E', 'DP03_0071M',  # Mean SSI
    'DP03_0072E', 'DP03_0072M',  # Households with public assistance
    'DP03_0073E', 'DP03_0073M',  # Mean public assistance
    'DP03_0074E', 'DP03_0074M',  # Households with SNAP
    
    # Family income distribution
    'DP03_0075E', 'DP03_0075M',  # Total families
    'DP03_0076E', 'DP03_0076M',  # < $10k
    'DP03_0077E', 'DP03_0077M',  # $10k-$14,999
    'DP03_0078E', 'DP03_0078M',  # $15k-$24,999
    'DP03_0079E', 'DP03_0079M',  # $25k-$34,999
    'DP03_0080E', 'DP03_0080M',  # $35k-$49,999
    'DP03_0081E', 'DP03_0081M',  # $50k-$74,999
    'DP03_0082E', 'DP03_0082M',  # $75k-$99,999
    'DP03_0083E', 'DP03_0083M',  # $100k-$149,999
    'DP03_0084E', 'DP03_0084M',  # $150k-$199,999
    'DP03_0085E', 'DP03_0085M',  # $200k+
    
    # Family income summary statistics
    'DP03_0086E', 'DP03_0086M',  # Median family income
    'DP03_0087E', 'DP03_0087M',  # Mean family income
    
    # Per capita and other income
    'DP03_0088E', 'DP03_0088M',  # Per capita income
    'DP03_0089E', 'DP03_0089M',  # Nonfamily households
    'DP03_0090E', 'DP03_0090M',  # Median nonfamily income
    'DP03_0091E', 'DP03_0091M',  # Mean nonfamily income
    
    # Worker earnings
    'DP03_0092E', 'DP03_0092M',  # Median earnings for workers
    'DP03_0093E', 'DP03_0093M',  # Median earnings for male FT workers
    'DP03_0094E', 'DP03_0094M',  # Median earnings for female FT workers
    
    # Poverty statistics
    'DP03_0119E', 'DP03_0119M',  # % families below poverty
    'DP03_0120E', 'DP03_0120M',  # % families w/ children <18 below poverty
    'DP03_0121E', 'DP03_0121M',  # % families w/ children <5 only below poverty
    'DP03_0122E', 'DP03_0122M',  # % married couple families below poverty
    'DP03_0123E', 'DP03_0123M',  # % married w/ children <18 below poverty
    'DP03_0124E', 'DP03_0124M',  # % married w/ children <5 only below poverty
    'DP03_0125E', 'DP03_0125M',  # % female householder families below poverty
    'DP03_0126E', 'DP03_0126M',  # % female householder w/ children <18 below poverty
    'DP03_0127E', 'DP03_0127M',  # % female householder w/ children <5 only below poverty
    'DP03_0128E', 'DP03_0128M',  # % all people below poverty
    'DP03_0129E', 'DP03_0129M',  # % people under 18 below poverty
    'DP03_0130E', 'DP03_0130M',  # % related children under 18 below poverty
    'DP03_0131E', 'DP03_0131M',  # % related children under 5 below poverty
    'DP03_0132E', 'DP03_0132M',  # % related children 5-17 below poverty
    'DP03_0133E', 'DP03_0133M',  # % people 18+ below poverty
    'DP03_0134E', 'DP03_0134M',  # % people 18-64 below poverty
    'DP03_0135E', 'DP03_0135M',  # % people 65+ below poverty
    'DP03_0136E', 'DP03_0136M',  # % people in families below poverty
    'DP03_0137E', 'DP03_0137M',  # % unrelated individuals 15+ below poverty
]

# Column name mapping (technical name -> readable name)
COLUMN_MAPPING = {
    'GEO_ID': 'geo_id',
    'NAME': 'name',
    
    # Household income distribution
    'DP03_0051E': 'total_households',
    'DP03_0051M': 'total_households_moe',
    'DP03_0052E': 'hh_income_under_10k',
    'DP03_0052M': 'hh_income_under_10k_moe',
    'DP03_0053E': 'hh_income_10k_15k',
    'DP03_0053M': 'hh_income_10k_15k_moe',
    'DP03_0054E': 'hh_income_15k_25k',
    'DP03_0054M': 'hh_income_15k_25k_moe',
    'DP03_0055E': 'hh_income_25k_35k',
    'DP03_0055M': 'hh_income_25k_35k_moe',
    'DP03_0056E': 'hh_income_35k_50k',
    'DP03_0056M': 'hh_income_35k_50k_moe',
    'DP03_0057E': 'hh_income_50k_75k',
    'DP03_0057M': 'hh_income_50k_75k_moe',
    'DP03_0058E': 'hh_income_75k_100k',
    'DP03_0058M': 'hh_income_75k_100k_moe',
    'DP03_0059E': 'hh_income_100k_150k',
    'DP03_0059M': 'hh_income_100k_150k_moe',
    'DP03_0060E': 'hh_income_150k_200k',
    'DP03_0060M': 'hh_income_150k_200k_moe',
    'DP03_0061E': 'hh_income_200k_plus',
    'DP03_0061M': 'hh_income_200k_plus_moe',
    
    # Household income summary
    'DP03_0062E': 'median_household_income',
    'DP03_0062M': 'median_household_income_moe',
    'DP03_0063E': 'mean_household_income',
    'DP03_0063M': 'mean_household_income_moe',
    
    # Household income sources
    'DP03_0064E': 'hh_with_earnings',
    'DP03_0064M': 'hh_with_earnings_moe',
    'DP03_0065E': 'mean_earnings',
    'DP03_0065M': 'mean_earnings_moe',
    'DP03_0066E': 'hh_with_social_security',
    'DP03_0066M': 'hh_with_social_security_moe',
    'DP03_0067E': 'mean_social_security_income',
    'DP03_0067M': 'mean_social_security_income_moe',
    'DP03_0068E': 'hh_with_retirement_income',
    'DP03_0068M': 'hh_with_retirement_income_moe',
    'DP03_0069E': 'mean_retirement_income',
    'DP03_0069M': 'mean_retirement_income_moe',
    'DP03_0070E': 'hh_with_ssi',
    'DP03_0070M': 'hh_with_ssi_moe',
    'DP03_0071E': 'mean_ssi',
    'DP03_0071M': 'mean_ssi_moe',
    'DP03_0072E': 'hh_with_public_assistance',
    'DP03_0072M': 'hh_with_public_assistance_moe',
    'DP03_0073E': 'mean_public_assistance',
    'DP03_0073M': 'mean_public_assistance_moe',
    'DP03_0074E': 'hh_with_snap',
    'DP03_0074M': 'hh_with_snap_moe',
    
    # Family income distribution
    'DP03_0075E': 'total_families',
    'DP03_0075M': 'total_families_moe',
    'DP03_0076E': 'family_income_under_10k',
    'DP03_0076M': 'family_income_under_10k_moe',
    'DP03_0077E': 'family_income_10k_15k',
    'DP03_0077M': 'family_income_10k_15k_moe',
    'DP03_0078E': 'family_income_15k_25k',
    'DP03_0078M': 'family_income_15k_25k_moe',
    'DP03_0079E': 'family_income_25k_35k',
    'DP03_0079M': 'family_income_25k_35k_moe',
    'DP03_0080E': 'family_income_35k_50k',
    'DP03_0080M': 'family_income_35k_50k_moe',
    'DP03_0081E': 'family_income_50k_75k',
    'DP03_0081M': 'family_income_50k_75k_moe',
    'DP03_0082E': 'family_income_75k_100k',
    'DP03_0082M': 'family_income_75k_100k_moe',
    'DP03_0083E': 'family_income_100k_150k',
    'DP03_0083M': 'family_income_100k_150k_moe',
    'DP03_0084E': 'family_income_150k_200k',
    'DP03_0084M': 'family_income_150k_200k_moe',
    'DP03_0085E': 'family_income_200k_plus',
    'DP03_0085M': 'family_income_200k_plus_moe',
    
    # Family income summary
    'DP03_0086E': 'median_family_income',
    'DP03_0086M': 'median_family_income_moe',
    'DP03_0087E': 'mean_family_income',
    'DP03_0087M': 'mean_family_income_moe',
    
    # Per capita and other income
    'DP03_0088E': 'per_capita_income',
    'DP03_0088M': 'per_capita_income_moe',
    'DP03_0089E': 'nonfamily_households',
    'DP03_0089M': 'nonfamily_households_moe',
    'DP03_0090E': 'median_nonfamily_income',
    'DP03_0090M': 'median_nonfamily_income_moe',
    'DP03_0091E': 'mean_nonfamily_income',
    'DP03_0091M': 'mean_nonfamily_income_moe',
    
    # Worker earnings
    'DP03_0092E': 'median_earnings_workers',
    'DP03_0092M': 'median_earnings_workers_moe',
    'DP03_0093E': 'median_earnings_male_ft',
    'DP03_0093M': 'median_earnings_male_ft_moe',
    'DP03_0094E': 'median_earnings_female_ft',
    'DP03_0094M': 'median_earnings_female_ft_moe',
    
    # Poverty statistics
    'DP03_0119E': 'pct_families_poverty',
    'DP03_0119M': 'pct_families_poverty_moe',
    'DP03_0120E': 'pct_families_children_u18_poverty',
    'DP03_0120M': 'pct_families_children_u18_poverty_moe',
    'DP03_0121E': 'pct_families_children_u5_only_poverty',
    'DP03_0121M': 'pct_families_children_u5_only_poverty_moe',
    'DP03_0122E': 'pct_married_families_poverty',
    'DP03_0122M': 'pct_married_families_poverty_moe',
    'DP03_0123E': 'pct_married_children_u18_poverty',
    'DP03_0123M': 'pct_married_children_u18_poverty_moe',
    'DP03_0124E': 'pct_married_children_u5_only_poverty',
    'DP03_0124M': 'pct_married_children_u5_only_poverty_moe',
    'DP03_0125E': 'pct_female_householder_poverty',
    'DP03_0125M': 'pct_female_householder_poverty_moe',
    'DP03_0126E': 'pct_female_householder_children_u18_poverty',
    'DP03_0126M': 'pct_female_householder_children_u18_poverty_moe',
    'DP03_0127E': 'pct_female_householder_children_u5_only_poverty',
    'DP03_0127M': 'pct_female_householder_children_u5_only_poverty_moe',
    'DP03_0128E': 'pct_people_poverty',
    'DP03_0128M': 'pct_people_poverty_moe',
    'DP03_0129E': 'pct_people_u18_poverty',
    'DP03_0129M': 'pct_people_u18_poverty_moe',
    'DP03_0130E': 'pct_children_u18_poverty',
    'DP03_0130M': 'pct_children_u18_poverty_moe',
    'DP03_0131E': 'pct_children_u5_poverty',
    'DP03_0131M': 'pct_children_u5_poverty_moe',
    'DP03_0132E': 'pct_children_5_17_poverty',
    'DP03_0132M': 'pct_children_5_17_poverty_moe',
    'DP03_0133E': 'pct_people_18plus_poverty',
    'DP03_0133M': 'pct_people_18plus_poverty_moe',
    'DP03_0134E': 'pct_people_18_64_poverty',
    'DP03_0134M': 'pct_people_18_64_poverty_moe',
    'DP03_0135E': 'pct_people_65plus_poverty',
    'DP03_0135M': 'pct_people_65plus_poverty_moe',
    'DP03_0136E': 'pct_people_in_families_poverty',
    'DP03_0136M': 'pct_people_in_families_poverty_moe',
    'DP03_0137E': 'pct_unrelated_individuals_poverty',
    'DP03_0137M': 'pct_unrelated_individuals_poverty_moe',
}


def extract_zip_from_geo_id(geo_id):
    """
    Extract 5-digit ZIP code from Census GEO_ID.
    
    Census GEO_IDs for ZCTAs look like: '860Z200US00601'
    We extract the last 5 characters.
    
    Args:
        geo_id (str): Census GEO_ID string
        
    Returns:
        str: 5-digit ZIP code, or None if invalid
    """
    if pd.isna(geo_id):
        return None
    
    geo_id = str(geo_id)
    
    # Check if this is a ZCTA geography (starts with 860Z200US or 860Z5)
    if geo_id.startswith('860Z') and len(geo_id) >= 14:
        zip_code = geo_id[-5:]
        # Validate it's 5 digits
        if zip_code.isdigit() and len(zip_code) == 5:
            return zip_code
    
    return None


def main():
    print("=" * 70)
    print("ACS DP03 Income Data Processor")
    print("=" * 70)
    print()
    
    # Verify input files exist
    if not DATA_CSV.exists():
        print(f"ERROR: Data file not found: {DATA_CSV}")
        return 1
    
    if not METADATA_CSV.exists():
        print(f"ERROR: Metadata file not found: {METADATA_CSV}")
        return 1
    
    print(f"Data Input:     {DATA_CSV}")
    print(f"Metadata Input: {METADATA_CSV}")
    print(f"Output:         {OUTPUT_CSV}")
    print()
    
    # Load column metadata to validate our column selections
    print("Loading column metadata...")
    try:
        metadata_df = pd.read_csv(METADATA_CSV)
        print(f"  Loaded metadata for {len(metadata_df):,} columns")
        
        # Create a mapping of column name to label for documentation
        column_labels = dict(zip(metadata_df['Column Name'], metadata_df['Label']))
        
        # Validate that our income columns exist in the metadata
        missing_in_metadata = [col for col in INCOME_COLUMNS if col not in column_labels and col not in ['GEO_ID', 'NAME']]
        if missing_in_metadata:
            print(f"  WARNING: {len(missing_in_metadata)} income columns not found in metadata:")
            for col in missing_in_metadata[:5]:
                print(f"    - {col}")
            if len(missing_in_metadata) > 5:
                print(f"    ... and {len(missing_in_metadata) - 5} more")
    except Exception as e:
        print(f"WARNING: Could not load metadata: {e}")
        column_labels = {}
    
    # Load the data (skip the first row which is a descriptive header)
    print("\nLoading ACS data...")
    try:
        df = pd.read_csv(DATA_CSV, dtype=str, low_memory=False, skiprows=[1])
        print(f"  Loaded {len(df):,} rows and {len(df.columns):,} columns")
    except Exception as e:
        print(f"ERROR loading data: {e}")
        return 1
    
    # Select only the income-related columns we want
    print("\nSelecting income-related columns...")
    missing_cols = [col for col in INCOME_COLUMNS if col not in df.columns]
    if missing_cols:
        print(f"  WARNING: {len(missing_cols)} columns not found in data:")
        for col in missing_cols[:10]:  # Show first 10
            print(f"    - {col}")
        if len(missing_cols) > 10:
            print(f"    ... and {len(missing_cols) - 10} more")
    
    available_cols = [col for col in INCOME_COLUMNS if col in df.columns]
    df = df[available_cols].copy()
    print(f"  Selected {len(available_cols)} columns")
    
    # Extract ZIP codes from GEO_ID
    print("\nExtracting ZIP codes from GEO_ID...")
    df['zip'] = df['GEO_ID'].apply(extract_zip_from_geo_id)
    
    # Filter to only valid ZIP codes (ZCTAs)
    initial_count = len(df)
    df = df[df['zip'].notna()].copy()
    print(f"  Filtered from {initial_count:,} to {len(df):,} ZIP-level geographies")
    
    if len(df) == 0:
        print("ERROR: No ZIP code geographies found in data!")
        return 1
    
    # Rename columns to readable names
    print("\nRenaming columns to readable format...")
    df = df.rename(columns=COLUMN_MAPPING)
    
    # Reorder columns: zip, name, then all others
    cols = ['zip', 'name'] + [col for col in df.columns if col not in ['zip', 'name', 'geo_id']]
    df = df[cols]
    
    # Sort by ZIP code
    print("Sorting by ZIP code...")
    df = df.sort_values('zip').reset_index(drop=True)
    
    # Ensure output directory exists
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    
    # Save to CSV
    print(f"\nWriting output to {OUTPUT_CSV}...")
    df.to_csv(OUTPUT_CSV, index=False)
    
    # Write a column documentation file if we have metadata
    if column_labels:
        doc_file = PROCESSED_DIR / 'acs_income_by_zip_2023_columns.csv'
        print(f"Writing column documentation to {doc_file}...")
        
        # Build documentation for each column in our output
        doc_data = []
        for col in df.columns:
            if col == 'zip':
                doc_data.append({
                    'output_column_name': col,
                    'original_column_name': 'Derived from GEO_ID',
                    'description': '5-digit ZIP Code Tabulation Area (ZCTA)'
                })
            elif col == 'name':
                doc_data.append({
                    'output_column_name': col,
                    'original_column_name': 'NAME',
                    'description': column_labels.get('NAME', 'Geographic Area Name')
                })
            else:
                # Find the original column name
                orig_col = [k for k, v in COLUMN_MAPPING.items() if v == col]
                if orig_col:
                    orig_col = orig_col[0]
                    doc_data.append({
                        'output_column_name': col,
                        'original_column_name': orig_col,
                        'description': column_labels.get(orig_col, 'No description available')
                    })
        
        doc_df = pd.DataFrame(doc_data)
        doc_df.to_csv(doc_file, index=False)
        print(f"  Documented {len(doc_df):,} columns")
    
    print()
    print("=" * 70)
    print(f"SUCCESS! Processed {len(df):,} ZIP codes")
    print(f"Output Data: {OUTPUT_CSV}")
    if column_labels:
        print(f"Output Docs: {PROCESSED_DIR / 'acs_income_by_zip_2023_columns.csv'}")
    print("=" * 70)
    
    # Show a sample
    print("\nSample of first 3 ZIP codes:")
    print(df[['zip', 'name', 'median_household_income', 'per_capita_income', 'pct_people_poverty']].head(3).to_string(index=False))
    
    return 0


if __name__ == '__main__':
    exit(main())

