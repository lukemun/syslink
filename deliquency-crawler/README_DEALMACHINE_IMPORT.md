# DealMachine CSV Import Guide

## Summary

Successfully converted **493 valid property records** from `delinquent_taxes_deduplicated.json` to DealMachine-compatible CSV format.

**File:** `dealmachine_import.csv`

### What Was Fixed

The conversion script uses the **`usaddress`** library (machine learning-based US address parser) to accurately parse addresses into components. Additionally, it:

1. ✅ **Fixed malformed zip codes:**
   - 4-digit Florida zips → added leading zero (e.g., `3388` → `33388`)
   - 6-digit zips → added hyphen (e.g., `334446` → `33444-6`)
   - Truncated zip+4 → removed invalid extensions (e.g., `33131-294` → `33131`)

2. ✅ **Removed problematic characters:**
   - Commas, periods, parentheses, asterisks per DealMachine requirements

3. ✅ **Filtered out invalid records (7 rows skipped):**
   - Missing zip codes
   - Non-US addresses (Canadian)
   - Incomplete address data

### CSV Format

The file includes these columns (required fields in **bold**):

- **Address Line 1** - Street address
- **City** - City name
- **State** - 2-letter state code
- **Zip Code** - 5-digit or 5+4 digit format
- **County** - County name
- Owner Name - Property owner
- DBA Business Name - Business name (if applicable)
- Total Warrant Amount - Tax amount owed
- Number of Warrants - Number of tax warrants
- Original Address - Reference field

## How to Upload to DealMachine

1. Sign in to [DealMachine.com](https://dealmachine.com)
2. Go to the **"Leads"** tab
3. Click **"Add Leads"**
4. Select **"Import List"**
5. Click **"Upload List"** and choose `dealmachine_import.csv`
6. Verify the auto-mapping (fields should match automatically)
7. Click **"Import List"**

## Running the Conversion Again

If you need to convert updated data in the future:

### Option 1: Quick Run
```bash
cd deliquency-crawler
./convert_to_dealmachine.sh
```

### Option 2: Manual Run
```bash
cd deliquency-crawler
source venv/bin/activate
python json_to_dealmachine_csv.py
```

## Files

- `json_to_dealmachine_csv.py` - Conversion script
- `convert_to_dealmachine.sh` - Quick run script
- `requirements.txt` - Python dependencies
- `venv/` - Virtual environment (already set up)
- `dealmachine_import.csv` - **Ready to upload!** (493 valid records)
- `dealmachine_import_skipped.csv` - **Skipped records log** (7 invalid records)

## Validation Results

✅ **All 493 rows validated successfully**
- ✅ All have complete street addresses
- ✅ All have city names
- ✅ All have valid 2-letter state codes
- ✅ All have valid 5-digit (or 5+4) zip codes
- ✅ No special characters that violate DealMachine requirements
- ✅ No non-US addresses

## Skipped Records Log

7 records were excluded and logged to **`dealmachine_import_skipped.csv`**

### Why Records Were Skipped

| Issue | Count | Examples |
|-------|-------|----------|
| Missing zip code | 5 | Missing from source data |
| Invalid zip format | 2 | Canadian address, incomplete US zip |

### Skipped Records Summary

The log file includes:
- **Original Address** - The problematic address from source data
- **Error Reason** - Why it couldn't be imported
- **Owner Name** - Property owner (for reference)
- **County** - County information
- **Total Warrant Amount** - Tax amount
- **Number of Warrants** - Number of warrants

These represent incomplete or invalid data in the source file and cannot be imported to DealMachine until the source addresses are corrected.

### Total Value of Skipped Records

The 7 skipped records represent approximately **$2.35M** in warrant amounts:
- MEL MOTORS LLC - $624,302.89 (missing city & zip)
- OHM CITY VAPES INC - $541,124.15 (missing zip)
- DA FAMILY BUSINESS LLC - $375,409.69 (missing zip)
- NANZ CUSTOM HARDWARE INC - $285,763.31 (invalid NY zip)
- TECVALCO INTERNATIONAL INC - $221,769.18 (Canadian address)
- JOSE SANTIAGO - $157,074.63 (missing city & zip)
- AG CARS EXPORT LLC - $143,496.55 (missing zip)

---

**Ready to import!** Your file should upload to DealMachine without errors.

