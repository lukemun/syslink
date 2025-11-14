#!/usr/bin/env python3
"""
Script to parse delinquent_taxes.xlsx and convert it to CSV and JSON formats.
"""

import pandas as pd
import json
from pathlib import Path

def main():
    # File paths
    input_file = 'delinquent_taxes.xlsx'
    csv_output = 'delinquent_taxes.csv'
    json_output = 'delinquent_taxes.json'
    
    print(f"Reading Excel file: {input_file}")
    
    try:
        # Read the Excel file, skipping the first row (title) and using row 2 as headers
        df = pd.read_excel(input_file, header=1)
        
        # Clean up the column names - remove any leading/trailing spaces
        df.columns = df.columns.str.strip()
        
        # Display basic information
        print(f"\n{'='*60}")
        print(f"Successfully loaded data!")
        print(f"{'='*60}")
        print(f"Total rows: {len(df)}")
        print(f"Total columns: {len(df.columns)}")
        print(f"\nColumn names:")
        for i, col in enumerate(df.columns, 1):
            print(f"  {i}. {col}")
        
        # Show preview of first few rows
        print(f"\n{'='*60}")
        print("Preview of first 5 rows:")
        print(f"{'='*60}")
        print(df.head().to_string())
        
        # Export to CSV
        print(f"\n{'='*60}")
        print(f"Exporting to CSV: {csv_output}")
        df.to_csv(csv_output, index=False)
        print(f"✓ CSV file created successfully!")
        
        # Export to JSON
        print(f"\nExporting to JSON: {json_output}")
        df.to_json(json_output, orient='records', indent=2)
        print(f"✓ JSON file created successfully!")
        
        # Show data types
        print(f"\n{'='*60}")
        print("Data types:")
        print(f"{'='*60}")
        print(df.dtypes.to_string())
        
        # Show basic statistics for numeric columns
        numeric_cols = df.select_dtypes(include=['number']).columns
        if len(numeric_cols) > 0:
            print(f"\n{'='*60}")
            print("Summary statistics for numeric columns:")
            print(f"{'='*60}")
            print(df[numeric_cols].describe().to_string())
        
        print(f"\n{'='*60}")
        print("Conversion complete! Files created:")
        print(f"  • {csv_output}")
        print(f"  • {json_output}")
        print(f"{'='*60}")
        
    except FileNotFoundError:
        print(f"Error: Could not find {input_file}")
        print("Make sure the file exists in the current directory.")
    except Exception as e:
        print(f"Error: {e}")
        print("\nMake sure you have the required packages installed:")
        print("  pip install pandas openpyxl")

if __name__ == "__main__":
    main()

