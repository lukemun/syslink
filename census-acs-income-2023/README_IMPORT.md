# Census Income Data Import to Supabase

## Overview

This directory contains scripts to import US Census American Community Survey (ACS) 5-Year Estimates (2023) income data by ZIP code into Supabase for use in lead enrichment and scoring.

## Data Source

- **Dataset**: 2023 ACS 5-Year Estimates, Table DP03 (Economic Characteristics)
- **Geography**: ZIP Code Tabulation Areas (ZCTAs)
- **Processed Files**: `processed/wealth_by_zip_enhanced.csv`

## Prerequisites

1. **Supabase Migration**: Run the census table migration first
   ```bash
   # From the project root
   supabase migration up
   # Or apply specifically:
   psql $DATABASE_URL -f supabase/migrations/20250122_create_census_income_by_zip_table.sql
   ```

2. **Environment Variables**: Set the following in a `.env` file at the project root:
   ```bash
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SECRET_KEY=your-service-role-key
   ```
   
   The script also supports these alternative environment variable names:
   - `NEXT_PUBLIC_SUPABASE_URL` (for URL)
   - `SUPABASE_SERVICE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, or `SERVICE_ROLE_KEY` (for service key)

3. **Dependencies**: Ensure you have Node.js installed (the script uses dependencies from `nextjs/` directory)

## Import Steps

### 1. Verify the Source CSV

The import script reads from `processed/wealth_by_zip_enhanced.csv`. This file should contain:

- ~33,000 ZIP codes
- Key columns: zip, total_households, mean_household_income, median_household_income, per_capita_income, mean_earnings, hh_income_200k_plus, pct_people_poverty, median_earnings_workers, pct_wealthy_households

To regenerate this file (if needed):
```bash
cd census-acs-income-2023
python3 scripts/create_simple_wealth_dataset.py
```

### 2. Run the Import Script

From anywhere in the project:

```bash
# The script automatically loads .env from the project root
node nextjs/scripts/import-census-data.js
```

**Note**: The script must be run with access to the `.env` file. If running from a sandboxed environment, you may need to grant additional permissions.

### 3. Verify the Import

The script will output:
- Number of rows parsed from CSV
- Sample row structure
- Import progress by batch
- Final row count in the table

You can also verify manually:

```sql
-- Check row count
SELECT COUNT(*) FROM census_income_by_zip;

-- Check sample data
SELECT zip, median_household_income, pct_people_poverty, total_households
FROM census_income_by_zip
ORDER BY median_household_income DESC
LIMIT 10;

-- Check for missing ZIPs (ZIPs in alerts but not in census)
SELECT DISTINCT waz.zipcode
FROM weather_alert_zipcodes waz
LEFT JOIN census_income_by_zip ciz ON waz.zipcode = ciz.zip
WHERE ciz.zip IS NULL
LIMIT 20;
```

## Data Schema

The `census_income_by_zip` table includes:

| Column | Type | Description |
|--------|------|-------------|
| zip | CHAR(5) | 5-digit ZIP code (primary key) |
| name | TEXT | ZCTA name (e.g., "ZCTA5 90210") |
| state | CHAR(2) | State code (NULL initially, can be populated) |
| county_name | TEXT | County name (NULL initially) |
| total_households | INTEGER | Total households in ZIP |
| median_household_income | INTEGER | Median household income ($) |
| mean_household_income | INTEGER | Mean household income ($) |
| per_capita_income | INTEGER | Per capita income ($) |
| hh_income_200k_plus | INTEGER | Count of $200k+ households |
| pct_people_poverty | NUMERIC(5,2) | Poverty rate (%) |
| median_earnings_workers | INTEGER | Median earnings for workers ($) |
| mean_earnings | INTEGER | Mean earnings ($) |
| pct_wealthy_households | NUMERIC(5,2) | Percent of wealthy households (%) |
| year | INTEGER | Data year (2023) |
| created_at | TIMESTAMPTZ | Import timestamp |
| updated_at | TIMESTAMPTZ | Last update timestamp |

## Re-importing / Updating Data

The import script uses `UPSERT` (insert or update on conflict), so you can:

1. Re-run the script to update all data
2. Manually update specific ZIPs via SQL
3. Import supplementary data (e.g., state codes) separately

Example update for state codes (if you have a mapping):

```sql
-- Assuming you have a zip_to_state mapping table or can derive from another source
UPDATE census_income_by_zip ciz
SET state = zs.state_code
FROM zip_to_state zs
WHERE ciz.zip = zs.zip;
```

## Troubleshooting

### Issue: "Failed to read CSV file"
- **Solution**: Verify the CSV exists at `census-acs-income-2023/processed/wealth_by_zip_enhanced.csv`
- Run the Python script to regenerate if needed

### Issue: "Missing required environment variables"
- **Solution**: Ensure `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set
- Check `.env` file or export them in your shell

### Issue: Import fails with Supabase error
- **Solution**: Verify the migration has been applied
- Check service key has write permissions
- Ensure no column name mismatches between CSV and table schema

### Issue: Some ZIPs are missing
- **Cause**: Census data doesn't cover all ZIPs (especially new or sparsely populated ZCTAs)
- **Solution**: This is expected; the leads API will skip alerts for ZIPs without census data
- Consider fallback to county-level data or excluding those leads

## Performance Notes

- The script imports in batches of 500 rows
- Expected import time: 1-2 minutes for ~33,000 ZIPs
- The table uses indexes on `median_household_income` and `pct_people_poverty` for fast filtering

## Next Steps

After importing:

1. **Test the Leads API**: Visit `/api/leads` to verify enrichment is working
2. **View the Leads Dashboard**: Navigate to `/leads` in the Next.js app
3. **Tune Scoring**: Adjust weights in `nextjs/shared/leadScoring.ts` based on results
4. **Add Filters**: Enhance the leads page with state/income/score filters as needed

## Related Files

- Migration: `supabase/migrations/20250122_create_census_income_by_zip_table.sql`
- Import Script: `nextjs/scripts/import-census-data.js`
- Scoring Logic: `nextjs/shared/leadScoring.ts`
- API Route: `nextjs/app/api/leads/route.ts`
- UI Page: `nextjs/app/leads/page.tsx`

