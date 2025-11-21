# Leads System - Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Apply the Database Migration

```bash
cd /Users/lukemunro/Clones/syslink

# Apply the migration
supabase migration up

# Or if using psql directly:
psql $DATABASE_URL -f supabase/migrations/20250122_create_census_income_by_zip_table.sql
```

This creates the `census_income_by_zip` table to store income data by ZIP code.

### Step 2: Import Census Data

```bash
# Set your Supabase credentials
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_KEY="your-service-role-key"

# Run the import (takes ~2 minutes for 33k ZIPs)
tsx census-acs-income-2023/scripts/import-to-supabase.ts
```

You should see output like:
```
✓ Parsed 33,754 ZIP codes
✓ Transformed 33,754 rows
✓ Batch 1/68 imported (500/33754 total)
...
✓ Successfully imported: 33,754 rows
✓ Total rows in table: 33,754
```

### Step 3: View Your Leads

```bash
# Start the Next.js dev server (if not already running)
cd nextjs
npm run dev
```

Then navigate to: **http://localhost:3000/leads**

You should see a table of weather alert leads ranked by score!

## 📊 What You'll See

The leads page shows:
- **Lead Score (0-100)**: Higher = better opportunity
- **ZIP Code**: With confidence indicator if both polygon and city match
- **Alert Type**: Event name, severity, and damage risk badge
- **Location**: Area description from the alert
- **Income Data**: Median income, mean income, poverty rate
- **Households**: Total households in the ZIP
- **Why This Lead**: Human-readable explanation of the score

## 🎯 Understanding the Scores

- **80-100 (Red)**: 🔥 Hot Lead - High priority
- **60-79 (Orange)**: 🟠 Warm Lead - Good opportunity  
- **40-59 (Yellow)**: 🟡 Moderate Lead - Consider
- **0-39 (Gray)**: ⚪ Cool Lead - Lower priority

## 🔧 Customizing the Scoring

Want to adjust the scoring weights? Edit `nextjs/shared/leadScoring.ts`:

```typescript
export const SCORING_WEIGHTS = {
  income: 0.3,      // 30% - Lower income = higher score
  severity: 0.3,    // 30% - More severe = higher score
  frequency: 0.3,   // 30% - More alerts = higher score
  overlap: 0.1,     // 10% - Confidence boost
};
```

Changes take effect immediately on server restart (no DB changes needed).

## 📡 Using the API

You can also query leads programmatically:

```bash
# Get top 20 leads with score ≥ 60
curl "http://localhost:3000/api/leads?minScore=60&limit=20"

# Get damage-relevant alerts only
curl "http://localhost:3000/api/leads?isDamaged=true"

# Get leads for a specific ZIP
curl "http://localhost:3000/api/leads?zip=90210"

# Combine filters
curl "http://localhost:3000/api/leads?minScore=50&limit=10&isDamaged=true"
```

Response format:
```json
{
  "leads": [
    {
      "alertId": "...",
      "event": "Tornado Warning",
      "severity": "Extreme",
      "zip": "12345",
      "medianIncome": 28000,
      "povertyRate": 18.5,
      "leadScore": 85,
      "scoreExplanation": [
        "Lower income area - high cash buyer potential",
        "High severity alert - likely property damage",
        ...
      ]
    }
  ],
  "count": 10,
  "totalBeforeLimit": 247
}
```

## 🔍 Verification Queries

Check that everything is working:

```sql
-- Verify census data is imported
SELECT COUNT(*) FROM census_income_by_zip;
-- Should return ~33,000

-- Check recent alerts
SELECT COUNT(*) 
FROM weather_alerts 
WHERE sent >= NOW() - INTERVAL '30 days';

-- Find alerts with census-enriched ZIPs
SELECT COUNT(DISTINCT waz.zipcode)
FROM weather_alert_zipcodes waz
JOIN census_income_by_zip ciz ON waz.zipcode = ciz.zip;

-- Sample high-score leads (manual check)
SELECT 
  waz.zipcode,
  wa.event,
  wa.severity,
  ciz.median_household_income,
  ciz.pct_people_poverty
FROM weather_alerts wa
JOIN weather_alert_zipcodes waz ON wa.id = waz.alert_id
JOIN census_income_by_zip ciz ON waz.zipcode = ciz.zip
WHERE wa.sent >= NOW() - INTERVAL '30 days'
  AND waz.from_polygon = TRUE
  AND ciz.median_household_income < 50000
ORDER BY ciz.median_household_income ASC
LIMIT 10;
```

## 📚 Additional Resources

- **Detailed Scoring Explanation**: `LEAD_SCORING.md`
- **Full Implementation Guide**: `LEADS_IMPLEMENTATION_SUMMARY.md`
- **Census Import Guide**: `census-acs-income-2023/README_IMPORT.md`
- **Alert Schema**: `supabase/migrations/20250119_create_weather_alerts_table.sql`

## 🆘 Troubleshooting

**Problem**: Leads page shows "No leads available"

**Check**:
1. Census data is imported: `SELECT COUNT(*) FROM census_income_by_zip;`
2. Recent alerts exist: `SELECT COUNT(*) FROM weather_alerts WHERE sent >= NOW() - INTERVAL '7 days';`
3. Alerts have ZIPs: `SELECT COUNT(*) FROM weather_alert_zipcodes;`

**Problem**: Import script fails

**Check**:
1. CSV exists: `ls census-acs-income-2023/processed/wealth_by_zip_enhanced.csv`
2. Environment variables are set: `echo $SUPABASE_URL`
3. Service key has write permissions

**Problem**: Scores seem wrong

**Check**:
1. Review scoring weights in `nextjs/shared/leadScoring.ts`
2. Check income distribution: `SELECT AVG(median_household_income) FROM census_income_by_zip;`
3. Verify alert severities: `SELECT DISTINCT severity FROM weather_alerts;`

## 🎉 You're Done!

The leads system is now running. As new weather alerts come in, they'll automatically appear in the leads dashboard with computed scores based on census income data.

Monitor the leads, track conversion rates, and adjust the scoring weights as you learn what factors best predict cash sale opportunities!

