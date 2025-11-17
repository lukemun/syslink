# American Community Survey (ACS) 2023 Income Data by ZIP Code

This directory contains American Community Survey (ACS) 5-year estimates (2019-2023) from Table DP03 (Selected Economic Characteristics), processed to provide income-related metrics by ZIP Code Tabulation Area (ZCTA).

## Data Source

- **Survey**: American Community Survey (ACS) 5-Year Data (2019-2023)
- **Table**: DP03 - Selected Economic Characteristics
- **Geographic Level**: ZIP Code Tabulation Areas (ZCTAs)
- **Currency**: 2023 inflation-adjusted dollars

## Directory Structure

```
census-acs-income-2023/
├── raw/
│   └── ACSDP5Y2023.DP03/          # Original downloaded Census data files
│       ├── ACSDP5Y2023.DP03-Data.csv
│       ├── ACSDP5Y2023.DP03-Column-Metadata.csv
│       └── ACSDP5Y2023.DP03-Table-Notes.txt
├── processed/
│   ├── acs_income_by_zip_2023.csv         # Final output: income metrics by ZIP
│   └── acs_income_by_zip_2023_columns.csv # Column documentation with descriptions
├── scripts/
│   └── acs_income_by_zip.py       # Script to process raw data
└── README.md                       # This file
```

## Income-Related Variables Included

The processed CSV includes the following income and benefits-related variables (all in 2023 inflation-adjusted dollars):

### Household Income Distribution
- **DP03_0051E/M**: Total households (count + margin of error)
- **DP03_0052E/M**: Households with income less than $10,000
- **DP03_0053E/M**: Households with income $10,000 to $14,999
- **DP03_0054E/M**: Households with income $15,000 to $24,999
- **DP03_0055E/M**: Households with income $25,000 to $34,999
- **DP03_0056E/M**: Households with income $35,000 to $49,999
- **DP03_0057E/M**: Households with income $50,000 to $74,999
- **DP03_0058E/M**: Households with income $75,000 to $99,999
- **DP03_0059E/M**: Households with income $100,000 to $149,999
- **DP03_0060E/M**: Households with income $150,000 to $199,999
- **DP03_0061E/M**: Households with income $200,000 or more

### Household Income Summary Statistics
- **DP03_0062E/M**: **Median household income (dollars)** ⭐ KEY METRIC
- **DP03_0063E/M**: **Mean household income (dollars)** ⭐ KEY METRIC

### Household Income Sources
- **DP03_0064E/M**: Households with earnings (count)
- **DP03_0065E/M**: Mean earnings for households with earnings (dollars)
- **DP03_0066E/M**: Households with Social Security income (count)
- **DP03_0067E/M**: Mean Social Security income (dollars)
- **DP03_0068E/M**: Households with retirement income (count)
- **DP03_0069E/M**: Mean retirement income (dollars)
- **DP03_0070E/M**: Households with Supplemental Security Income (count)
- **DP03_0071E/M**: Mean Supplemental Security Income (dollars)
- **DP03_0072E/M**: Households with cash public assistance income (count)
- **DP03_0073E/M**: Mean cash public assistance income (dollars)
- **DP03_0074E/M**: Households with Food Stamp/SNAP benefits in past 12 months (count)

### Family Income Distribution
- **DP03_0075E/M**: Total families (count)
- **DP03_0076E/M**: Families with income less than $10,000
- **DP03_0077E/M**: Families with income $10,000 to $14,999
- **DP03_0078E/M**: Families with income $15,000 to $24,999
- **DP03_0079E/M**: Families with income $25,000 to $34,999
- **DP03_0080E/M**: Families with income $35,000 to $49,999
- **DP03_0081E/M**: Families with income $50,000 to $74,999
- **DP03_0082E/M**: Families with income $75,000 to $99,999
- **DP03_0083E/M**: Families with income $100,000 to $149,999
- **DP03_0084E/M**: Families with income $150,000 to $199,999
- **DP03_0085E/M**: Families with income $200,000 or more

### Family Income Summary Statistics
- **DP03_0086E/M**: **Median family income (dollars)** ⭐ KEY METRIC
- **DP03_0087E/M**: **Mean family income (dollars)** ⭐ KEY METRIC

### Per Capita and Other Income Measures
- **DP03_0088E/M**: **Per capita income (dollars)** ⭐ KEY METRIC
- **DP03_0089E/M**: Nonfamily households (count)
- **DP03_0090E/M**: Median nonfamily household income (dollars)
- **DP03_0091E/M**: Mean nonfamily household income (dollars)

### Worker Earnings
- **DP03_0092E/M**: **Median earnings for workers (dollars)** ⭐ KEY METRIC
- **DP03_0093E/M**: Median earnings for male full-time, year-round workers (dollars)
- **DP03_0094E/M**: Median earnings for female full-time, year-round workers (dollars)

### Poverty Statistics
- **DP03_0119E/M**: Percent of families below poverty level
- **DP03_0120E/M**: Percent of families with children under 18 below poverty level
- **DP03_0121E/M**: Percent of families with children under 5 only below poverty level
- **DP03_0122E/M**: Percent of married couple families below poverty level
- **DP03_0123E/M**: Percent of married couple families with children under 18 below poverty level
- **DP03_0124E/M**: Percent of married couple families with children under 5 only below poverty level
- **DP03_0125E/M**: Percent of female householder families (no spouse) below poverty level
- **DP03_0126E/M**: Percent of female householder families with children under 18 below poverty level
- **DP03_0127E/M**: Percent of female householder families with children under 5 only below poverty level
- **DP03_0128E/M**: **Percent of all people below poverty level** ⭐ KEY METRIC
- **DP03_0129E/M**: Percent of people under 18 below poverty level
- **DP03_0130E/M**: Percent of related children under 18 below poverty level
- **DP03_0131E/M**: Percent of related children under 5 below poverty level
- **DP03_0132E/M**: Percent of related children 5 to 17 below poverty level
- **DP03_0133E/M**: Percent of people 18 and over below poverty level
- **DP03_0134E/M**: Percent of people 18 to 64 below poverty level
- **DP03_0135E/M**: Percent of people 65 and over below poverty level
- **DP03_0136E/M**: Percent of people in families below poverty level
- **DP03_0137E/M**: Percent of unrelated individuals 15+ below poverty level

**Note**: 
- Columns ending in `E` are **Estimates**
- Columns ending in `M` are **Margins of Error** (90% confidence level)
- All dollar amounts are in 2023 inflation-adjusted dollars

## Output CSV Structure

The processed file `processed/acs_income_by_zip_2023.csv` contains:

- **zip**: 5-digit ZIP code (ZCTA)
- **name**: Geographic area name from Census (e.g., "ZCTA5 94103")
- All income-related columns listed above with readable snake_case names

The CSV is sorted by ZIP code for easy lookup.

### Column Documentation

A companion file `processed/acs_income_by_zip_2023_columns.csv` provides complete documentation for each column, including:
- **output_column_name**: The readable column name in the processed CSV
- **original_column_name**: The original Census column ID (e.g., DP03_0062E)
- **description**: Full description from the Census metadata

This documentation file is automatically generated from the Census metadata and makes it easy to understand what each column represents.

## How to Regenerate the Data

### Prerequisites

- Python 3.x with pandas installed
- Use the existing virtualenv in the repo root: `deliquency-crawler/venv/`

### Steps

1. Activate the virtual environment:
```bash
cd /Users/lukemunro/Clones/syslink
source deliquency-crawler/venv/bin/activate
```

2. Install pandas if not already installed:
```bash
pip install pandas
```

3. Run the processing script:
```bash
python census-acs-income-2023/scripts/acs_income_by_zip.py
```

4. Find the output at:
```
census-acs-income-2023/processed/acs_income_by_zip_2023.csv
```

## Usage Examples

### Python/Pandas

```python
import pandas as pd

# Load the data
df = pd.read_csv('census-acs-income-2023/processed/acs_income_by_zip_2023.csv', 
                 dtype={'zip': str})

# Look up income for a specific ZIP code
zip_data = df[df['zip'] == '94103']
print(f"Median household income: ${zip_data['median_household_income'].iloc[0]}")
print(f"Per capita income: ${zip_data['per_capita_income'].iloc[0]}")

# Find high-income ZIP codes (median household income > $150k)
high_income = df[pd.to_numeric(df['median_household_income'], errors='coerce') > 150000]
print(f"Found {len(high_income)} high-income ZIP codes")

# Compare poverty rates
df['poverty_rate'] = pd.to_numeric(df['pct_people_poverty'], errors='coerce')
top_poverty = df.nlargest(10, 'poverty_rate')[['zip', 'name', 'poverty_rate']]
```

### Command Line

```bash
# Find median household income for ZIP 90210
grep "^90210," census-acs-income-2023/processed/acs_income_by_zip_2023.csv

# Count total ZIP codes
wc -l census-acs-income-2023/processed/acs_income_by_zip_2023.csv
```

## Notes

- **ZIP Code vs ZCTA**: Census uses ZIP Code Tabulation Areas (ZCTAs), which are approximate geographic representations of USPS ZIP codes. They may not match exactly, especially in rural areas or for PO Box-only ZIP codes.
- **Missing Data**: Some ZCTAs may have missing data (shown as empty/null or "(X)") if the sample size was too small for reliable estimates or data was suppressed for privacy.
- **Margins of Error**: The margins of error indicate the statistical reliability of each estimate at the 90% confidence level.

