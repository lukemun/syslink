# Census-Enriched Leads Implementation Summary

## Overview

This implementation adds a census-enriched leads system to the weather alerts application. Weather alerts are joined with US Census income data and scored 0-100 based on likelihood that property owners would be interested in cash sale opportunities following weather damage.

## Key Features

1. **Census Income Database Table**: Stores 2023 ACS income data by ZIP code
2. **Lead Scoring Algorithm**: Weights income, alert severity, frequency, and ZIP confidence
3. **On-the-Fly Computation**: Scores calculated in real-time (no materialized leads table)
4. **Leads API Endpoint**: RESTful endpoint with filtering and pagination
5. **Leads Dashboard UI**: Sortable table with detailed scoring breakdowns

## Architecture

### Data Flow

```
Weather Alerts (weather_alerts)
    ↓
Alert-to-ZIP Mappings (weather_alert_zipcodes)
    ↓
Census Income Data (census_income_by_zip) ← Imported from CSV
    ↓
API Route (/api/leads) ← Joins + Scores on request
    ↓
Leads Page (/leads) ← Displays ranked results
```

### No Materialized Leads Table

As requested, leads are **computed on the fly** in the API route rather than stored in a dedicated database table. This approach:

- ✅ Simplifies schema (no additional table needed)
- ✅ Always reflects current data (no stale scores)
- ✅ Easier to tune scoring weights (just restart server)
- ⚠️ Slightly higher latency per request (acceptable for current scale)
- ⚠️ Recomputes alert frequency each time (could be optimized with view if needed)

## Files Created/Modified

### Database Schema
- **`supabase/migrations/20250122_create_census_income_by_zip_table.sql`**
  - Creates `census_income_by_zip` table with income metrics
  - Indexes on median_household_income and pct_people_poverty
  - Stores 2023 ACS 5-year estimates by ZIP code

### Data Import
- **`census-acs-income-2023/scripts/import-to-supabase.ts`**
  - TypeScript script to import CSV data to Supabase
  - Reads `processed/wealth_by_zip_enhanced.csv`
  - Normalizes ZIP codes to 5-digit format
  - Upserts ~33,000 ZIPs in batches of 500

- **`census-acs-income-2023/README_IMPORT.md`**
  - Complete guide to running the census import
  - Troubleshooting tips
  - SQL verification queries

### Scoring Logic
- **`nextjs/shared/leadScoring.ts`**
  - Core scoring algorithm (0-100 scale)
  - Four weighted factors: income (30%), severity (30%), frequency (30%), overlap (10%)
  - Configurable weights via `SCORING_WEIGHTS` constant
  - `scoreLead()` function with detailed breakdown
  - `explainScore()` function for human-readable explanations

- **`nextjs/LEAD_SCORING.md`**
  - Comprehensive documentation of scoring methodology
  - Factor definitions and rationale
  - Score interpretation guide (hot/warm/moderate/cool)
  - Tuning recommendations
  - Example calculations

### API Layer
- **`nextjs/app/api/leads/route.ts`**
  - GET endpoint: `/api/leads`
  - Query params: `minScore`, `limit`, `state`, `zip`, `isDamaged`, `since`
  - Fetches alerts from last 30 days (or `since` parameter)
  - Joins with alert_zipcodes and census_income_by_zip
  - Computes frequency per ZIP
  - Scores each alert-ZIP combination
  - Returns sorted by score (descending)

### UI Components
- **`nextjs/app/leads/page.tsx`**
  - Server Component that fetches from `/api/leads`
  - Responsive table with columns:
    - Lead Score (0-100 badge with color coding)
    - ZIP Code (with confidence indicator)
    - Alert Type (event + severity + damage badges)
    - Location (area description)
    - Income (median, mean, poverty rate)
    - Households (total count)
    - Score Explanation (bullet points)
  - Scoring legend at bottom
  - Links to alerts dashboard

- **`nextjs/app/layout.tsx`** (modified)
  - Added "Leads" navigation link

## Scoring Formula

```
Score = (Income Factor × 0.3) + (Severity Factor × 0.3) + 
        (Frequency Factor × 0.3) + (Overlap Factor × 0.1)
```

Scaled to 0-100 and clamped.

### Factor Details

1. **Income Factor (30%)**
   - Lower income = higher score (inverse)
   - Brackets: <$30k (1.0) down to >$150k (0.1)
   - Poverty rate adds up to 20% boost

2. **Severity Factor (30%)**
   - NWS severity: Extreme (1.0), Severe (0.75), Moderate (0.5), etc.
   - Event-specific boosts: Tornado (1.0), Flash Flood (0.9), Hurricane (1.0), etc.

3. **Frequency Factor (30%)**
   - Recent alert count per ZIP: 0 alerts (0.1), 1 (0.3), 2 (0.5), 3 (0.7), 4+ (1.0)

4. **Overlap Factor (10%)**
   - Has overlap (polygon + city): 1.0
   - Single method: 0.5

## Usage Instructions

### 1. Apply Database Migration

```bash
cd /path/to/syslink
supabase migration up
# Or manually:
psql $DATABASE_URL -f supabase/migrations/20250122_create_census_income_by_zip_table.sql
```

### 2. Import Census Data

```bash
# Set environment variables
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_KEY="your-service-role-key"

# Run import
tsx census-acs-income-2023/scripts/import-to-supabase.ts
```

Expected output: ~33,000 ZIPs imported in 1-2 minutes.

### 3. Verify Import

```sql
SELECT COUNT(*) FROM census_income_by_zip;
-- Should return ~33,000

SELECT zip, median_household_income, pct_people_poverty
FROM census_income_by_zip
ORDER BY median_household_income DESC
LIMIT 10;
-- Check high-income ZIPs
```

### 4. Test the API

```bash
# From your browser or curl
curl "http://localhost:3000/api/leads?minScore=50&limit=20"
```

Response includes:
- `leads`: Array of scored lead objects
- `count`: Number of leads returned
- `totalBeforeLimit`: Total matching leads before limit applied
- `filters`: Applied filters

### 5. View the Dashboard

Navigate to: `http://localhost:3000/leads`

The page will:
- Fetch leads from the API
- Display in a sortable table (pre-sorted by score)
- Show score breakdowns and explanations
- Highlight high-confidence ZIPs (overlap)
- Display damage risk indicators

## API Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `minScore` | number | 0 | Minimum lead score (0-100) to include |
| `limit` | number | 100 | Max number of leads to return |
| `state` | string | null | Filter by state code (if populated in census) |
| `zip` | string | null | Filter by specific ZIP code |
| `isDamaged` | boolean | false | Filter for damage-relevant alerts only |
| `since` | ISO date | 30 days ago | Only include alerts sent on or after this date |

### Example Queries

```
# High-scoring leads only
GET /api/leads?minScore=60&limit=50

# Damage-relevant alerts
GET /api/leads?isDamaged=true

# Specific ZIP
GET /api/leads?zip=90210

# Alerts from last 7 days
GET /api/leads?since=2024-01-15T00:00:00Z

# Combined filters
GET /api/leads?minScore=50&isDamaged=true&limit=20
```

## Score Interpretation

- **80-100 (Hot Lead)**: High priority - Low income + severe damage + multiple events
- **60-79 (Warm Lead)**: Good opportunity - Moderate to high factors
- **40-59 (Moderate Lead)**: Consider based on capacity
- **0-39 (Cool Lead)**: Lower priority

## Tuning the Scoring

Adjust weights in `nextjs/shared/leadScoring.ts`:

```typescript
export const SCORING_WEIGHTS = {
  income: 0.3,      // Increase to prioritize lower-income areas
  severity: 0.3,    // Increase to prioritize severe events
  frequency: 0.3,   // Increase to prioritize repeat-event areas
  overlap: 0.1,     // Increase if ZIP accuracy is critical
};
```

After changing weights:
1. Restart the Next.js dev server
2. Re-fetch `/api/leads` (scores recompute automatically)
3. No database changes needed

## Performance Considerations

### Current Scale
- **Alerts**: ~1,000 per query (last 30 days)
- **ZIPs per alert**: ~10-50 (varies by alert size)
- **Total lead candidates**: ~10,000-50,000 per request
- **Response time**: ~1-3 seconds (acceptable for admin dashboard)

### Future Optimizations (if needed)

1. **Add a Materialized View**
   ```sql
   CREATE MATERIALIZED VIEW leads_view AS
   SELECT ...
   -- Refresh periodically
   ```

2. **Cache Recent Results**
   - Use Next.js caching or Redis
   - Invalidate on new alert ingestion

3. **Pre-aggregate Alert Frequencies**
   ```sql
   CREATE TABLE alert_frequency_by_zip (
     zipcode CHAR(5),
     window_days INT,
     alert_count INT,
     updated_at TIMESTAMPTZ
   );
   ```

4. **Add Indexes on Joins**
   - Already have indexes on alert_id and zipcode
   - Could add composite index on (zipcode, from_polygon) if filtering polygon ZIPs is slow

## Testing & Validation

### Smoke Tests

1. **Census data is present**:
   ```sql
   SELECT COUNT(*) FROM census_income_by_zip;
   -- Expect ~33,000
   ```

2. **API returns results**:
   ```bash
   curl http://localhost:3000/api/leads?limit=5
   # Should return JSON with 5 leads (if alerts exist)
   ```

3. **Scores are in valid range**:
   - Check that all `leadScore` values are 0-100
   - Verify high scores correspond to low income + severe events

4. **UI renders correctly**:
   - Navigate to `/leads`
   - Table should display with proper formatting
   - Score badges should be color-coded
   - Local timestamps should render

### Sample Validation Queries

```sql
-- Find high-scoring leads (manual verification)
-- Run the API logic manually to spot-check:

WITH recent_alerts AS (
  SELECT id, event, severity, sent
  FROM weather_alerts
  WHERE status = 'Actual'
    AND sent >= NOW() - INTERVAL '30 days'
  LIMIT 10
),
alert_zips AS (
  SELECT ra.*, waz.zipcode, waz.from_polygon, waz.from_city
  FROM recent_alerts ra
  JOIN weather_alert_zipcodes waz ON ra.id = waz.alert_id
  WHERE waz.from_polygon = TRUE
)
SELECT 
  az.zipcode,
  az.event,
  az.severity,
  ciz.median_household_income,
  ciz.pct_people_poverty
FROM alert_zips az
JOIN census_income_by_zip ciz ON az.zipcode = ciz.zip
WHERE ciz.median_household_income < 50000
ORDER BY ciz.median_household_income ASC
LIMIT 20;
```

## Known Limitations

1. **Census Coverage**: Not all ZIPs have census data (especially new ZCTAs or very small areas)
   - Leads API skips ZIPs without census data
   - ~5-10% of alert ZIPs may be excluded

2. **Alert Frequency Window**: Fixed at 30 days
   - Could make configurable in future
   - Adjust `sinceDate` calculation in `/api/leads/route.ts`

3. **No Client-Side Filtering**: All filtering happens server-side
   - Could add client-side sorting/filtering for better UX
   - Currently requires full page reload to change filters

4. **State/County Data Not Populated**: Census table has `state` and `county_name` columns but they're NULL
   - Can be populated from external ZIP-to-state mapping
   - Or derived from weather alert `area_desc` field

5. **No Export Functionality**: Leads are view-only
   - Could add CSV export button
   - Could integrate with CRM/outreach tools

## Future Enhancements

### High Priority
- [ ] Add client-side filtering UI (dropdowns for state, min score)
- [ ] Add CSV export of leads
- [ ] Populate state codes in census table
- [ ] Add alert frequency caching/pre-computation

### Medium Priority
- [ ] Historical lead tracking (save scores over time)
- [ ] Lead deduplication (same property across multiple alerts)
- [ ] Integration with property ownership data
- [ ] Email/SMS notification for high-score leads

### Low Priority
- [ ] Machine learning model to replace manual scoring
- [ ] Additional enrichment: FEMA claims, MLS data, property age
- [ ] Geographic visualization (map of leads)
- [ ] A/B testing of scoring weights with outcome tracking

## Success Metrics

Track these to validate the scoring system:

1. **Lead Quality**: Conversion rate from lead to outreach to deal
2. **Score Calibration**: Distribution of actual deals across score ranges
3. **False Positive Rate**: Leads that don't result in interest
4. **Coverage**: % of damage alerts that have scorable leads
5. **Response Time**: API latency under various load conditions

## Related Documentation

- **Lead Scoring Details**: `nextjs/LEAD_SCORING.md`
- **Census Import Guide**: `census-acs-income-2023/README_IMPORT.md`
- **Alert Database Schema**: `supabase/migrations/20250119_create_weather_alerts_table.sql`
- **ZIP Provenance Explanation**: `weather-apps/POLYGON_ZIP_DETECTION_EXPLAINED.md`

## Support & Troubleshooting

### Common Issues

**Issue**: Leads page shows "No leads available"
- Check that census data is imported: `SELECT COUNT(*) FROM census_income_by_zip;`
- Check that there are recent alerts: `SELECT COUNT(*) FROM weather_alerts WHERE sent >= NOW() - INTERVAL '30 days';`
- Check that alerts have ZIPs: `SELECT COUNT(*) FROM weather_alert_zipcodes;`

**Issue**: All scores are very low or very high
- Review scoring weights in `leadScoring.ts`
- Check income distribution in your dataset: `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY median_household_income) FROM census_income_by_zip;`
- Verify severity values: `SELECT DISTINCT severity FROM weather_alerts;`

**Issue**: API is slow
- Check alert volume: `SELECT COUNT(*) FROM weather_alerts WHERE sent >= NOW() - INTERVAL '30 days';`
- Consider adding `limit` parameter to reduce results
- Add database indexes if joins are slow (use `EXPLAIN ANALYZE`)

## Conclusion

This implementation provides a solid foundation for identifying and prioritizing property acquisition leads based on weather damage events and economic context. The scoring system is transparent, tunable, and requires no separate leads storage table, making it easy to iterate and improve over time.

**Next Steps**: Import the census data, verify a few leads manually, and begin tracking conversion rates to refine the scoring weights based on real-world outcomes.

