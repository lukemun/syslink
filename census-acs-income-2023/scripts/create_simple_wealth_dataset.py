#!/usr/bin/env python3
"""
Create Enhanced Wealth Dataset

This script creates an enriched subset of the ACS income data containing:
- ZIP code
- Total households (population size)
- Mean household income (best wealth indicator)
- Median household income (typical household)
- Per capita income (adjusts for household size)
- Mean earnings (working income)
- Count of $200k+ households
- Percentage of wealthy households
- Poverty rate
- Median worker earnings

Output: census-acs-income-2023/processed/wealth_by_zip_enhanced.csv
"""

import pandas as pd
from pathlib import Path

# Define paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
INPUT_CSV = PROJECT_DIR / 'processed' / 'acs_income_by_zip_2023.csv'
OUTPUT_CSV = PROJECT_DIR / 'processed' / 'wealth_by_zip_enhanced.csv'

def main():
    print('=' * 70)
    print('CREATE ENHANCED WEALTH DATASET')
    print('=' * 70)
    print()
    
    # Load the full dataset
    print(f'Loading: {INPUT_CSV}')
    df = pd.read_csv(INPUT_CSV, dtype={'zip': str})
    print(f'  Loaded {len(df):,} ZIP codes with {len(df.columns)} columns')
    
    # Select key fields
    print('\nExtracting key wealth indicators...')
    fields = [
        'zip',
        'total_households',
        'mean_household_income',
        'median_household_income',
        'per_capita_income',
        'mean_earnings',
        'hh_income_200k_plus',
        'pct_people_poverty',
        'median_earnings_workers'
    ]
    
    enhanced_df = df[fields].copy()
    
    # Convert numeric columns
    numeric_cols = [col for col in fields if col != 'zip']
    for col in numeric_cols:
        enhanced_df[col] = pd.to_numeric(enhanced_df[col], errors='coerce')
    
    # Remove rows with missing critical data (mean_household_income)
    initial_count = len(enhanced_df)
    enhanced_df = enhanced_df[enhanced_df['mean_household_income'].notna()].copy()
    removed_count = initial_count - len(enhanced_df)
    
    if removed_count > 0:
        print(f'  Removed {removed_count:,} ZIP codes with missing income data')
    
    # Calculate percentage of wealthy households
    print('\nCalculating wealth concentration...')
    enhanced_df['pct_wealthy_households'] = (
        (enhanced_df['hh_income_200k_plus'] / enhanced_df['total_households'] * 100)
        .round(1)
    )
    
    # Sort by mean household income (wealthiest first)
    print('Sorting by mean household income (highest to lowest)...')
    enhanced_df = enhanced_df.sort_values('mean_household_income', ascending=False)
    enhanced_df = enhanced_df.reset_index(drop=True)
    
    # Convert to integers where appropriate (keep poverty as float for decimals)
    int_cols = ['total_households', 'mean_household_income', 'median_household_income',
                'per_capita_income', 'mean_earnings', 'hh_income_200k_plus', 
                'median_earnings_workers']
    for col in int_cols:
        enhanced_df[col] = enhanced_df[col].fillna(0).astype(int)
    
    # Add rank column
    enhanced_df.insert(0, 'rank', range(1, len(enhanced_df) + 1))
    
    # Save to CSV
    print(f'\nWriting output to: {OUTPUT_CSV}')
    enhanced_df.to_csv(OUTPUT_CSV, index=False)
    
    print()
    print('=' * 70)
    print('SUCCESS!')
    print('=' * 70)
    print(f'Output: {OUTPUT_CSV}')
    print(f'Rows:   {len(enhanced_df):,} ZIP codes')
    print(f'Columns: {len(enhanced_df.columns)}')
    print()
    print('Fields included:')
    for col in enhanced_df.columns:
        print(f'  - {col}')
    print()
    
    # Show top 10 wealthiest ZIPs with details
    print('Top 10 Wealthiest ZIP Codes:')
    print('-' * 70)
    for _, row in enhanced_df.head(10).iterrows():
        print(f"  {row['rank']:>3}. ZIP {row['zip']}: "
              f"Mean=${row['mean_household_income']:>7,} | "
              f"HH={row['total_households']:>6,} | "
              f"Wealthy={row['pct_wealthy_households']:>5.1f}%")
    
    print()
    
    # Show statistics
    print('Dataset Statistics:')
    print('-' * 70)
    print(f"  ZIPs with >$200k mean income: {len(enhanced_df[enhanced_df['mean_household_income'] > 200000]):,}")
    print(f"  ZIPs with >30% wealthy households: {len(enhanced_df[enhanced_df['pct_wealthy_households'] > 30]):,}")
    print(f"  ZIPs with <$50k mean income: {len(enhanced_df[enhanced_df['mean_household_income'] < 50000]):,}")
    
    print()
    print('=' * 70)
    
    return 0


if __name__ == '__main__':
    exit(main())

