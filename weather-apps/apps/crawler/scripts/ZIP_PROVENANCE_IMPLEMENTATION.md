# ZIP Provenance Flags Implementation Summary

## Overview

This document summarizes the implementation of ZIP provenance flags in the `weather_alert_zipcodes` table. This feature enables tracking which filtering strategy (county, polygon, or city) identified each ZIP for a given alert, allowing flexible querying and analysis without requiring separate tables.

## What Changed

### 1. Database Schema (`supabase/migrations/20250120_add_zip_provenance_flags.sql`)

Added three boolean columns to `weather_alert_zipcodes`:
- `from_county` - ZIP identified via county (FIPS) mapping
- `from_polygon` - ZIP identified via geometry/centroid filtering  
- `from_city` - ZIP identified via city name text extraction

Added three partial indexes for optimized queries:
- `idx_weather_alert_zipcodes_polygon` - for polygon queries
- `idx_weather_alert_zipcodes_polygon_city` - for intersection queries
- `idx_weather_alert_zipcodes_city` - for city queries

### 2. Database Layer (`apps/crawler/src/db.ts`)

**New Interface:**
```typescript
export interface ZipcodeWithFlags {
  zipcode: string;
  fromCounty: boolean;
  fromPolygon: boolean;
  fromCity: boolean;
}
```

**Updated Function:**
- `upsertAlertZipcodes(alertId, zipcodes)` now accepts `ZipcodeWithFlags[]` instead of `string[]`
- Uses `ON CONFLICT ... DO UPDATE` to upsert flags on each row
- Preserves earliest `created_at` timestamp across upserts

### 3. Ingest Logic (`apps/crawler/src/ingest.ts`)

**Updated Enrichment Flow:**
1. Compute three ZIP sets per alert:
   - `allCountyZips` - baseline from SAME codes
   - `zipResult.zips` - polygon-filtered using centroids
   - `cityZips` - city-filtered from text extraction

2. Merge into combined set with flags:
   - Build `Map<string, { fromCounty, fromPolygon, fromCity }>`
   - Mark each ZIP with appropriate flags
   - Convert to `ZipcodeWithFlags[]` array

3. Write all ZIPs with flags to database

**Updated Logging:**
- Shows strategy breakdown per alert
- Displays counts for each strategy
- Shows intersection (high-confidence core)
- Compatible with existing `ZIP_REFINEMENT_DEBUG` mode

### 4. Documentation

**Updated:** `weather-apps/ZIP_REFINEMENT_EXPERIMENT.md`
- Added "Database Integration" section
- Documented query patterns for different use cases
- Explained flag semantics and indexes

**Created:** `apps/crawler/scripts/ROLLOUT_CHECKLIST.md`
- Step-by-step deployment guide
- Validation checkpoints
- Rollback procedures

**Created:** `apps/crawler/scripts/validate-zip-provenance.sql`
- 10 validation queries for staging/production
- Checks data integrity, distributions, and index usage

## Key Design Decisions

### Why Boolean Flags Instead of Array Columns?

**Per-ZIP access pattern:** The join table already exists for efficient `WHERE zipcode = '12345'` queries. Flags are cheap metadata on existing rows.

**Simple queries:** Boolean filters (`WHERE from_polygon = TRUE`) are faster and cleaner than array operations.

**Flexible composition:** Easy to query any combination (polygon only, polygon∩city, county∪polygon, etc.)

**Index-friendly:** Partial indexes on boolean conditions are well-optimized in Postgres.

### Why Store All Three Strategies?

**Experimental flexibility:** Can analyze precision/recall trade-offs without recomputing.

**Use-case flexibility:** Different consumers can choose different strategies:
- Property outreach: polygon or polygon∩city (high precision)
- Awareness campaigns: county (high recall)

**Minimal overhead:** 3 bytes per row for 3 booleans, trivial compared to existing data.

## Migration Impact

### Backward Compatibility
✅ **Existing queries work unchanged** (flags default to FALSE, no WHERE clause needed)

✅ **Existing code can coexist** (old code writes FLAGS=FALSE, new code writes FLAGS=TRUE)

✅ **No data loss** (all ZIPs still written, just with additional metadata)

### Performance
✅ **Partial indexes** optimize common filtered queries

✅ **Negligible storage overhead** (3 booleans = 3 bytes per row)

✅ **No additional network round-trips** (single upsert per alert)

## Query Examples

### Production Queries

**Default recommended query (polygon-filtered):**
```sql
SELECT w.*, array_agg(z.zipcode) as zipcodes
FROM weather_alerts w
JOIN weather_alert_zipcodes z ON w.id = z.alert_id
WHERE w.is_damaged = TRUE 
  AND z.from_polygon = TRUE
GROUP BY w.id;
```

**High-confidence targeting (polygon ∩ city):**
```sql
SELECT zipcode
FROM weather_alert_zipcodes
WHERE alert_id = 'xyz' 
  AND from_polygon = TRUE 
  AND from_city = TRUE;
```

### Analysis Queries

**Compare strategies for a specific alert:**
```sql
SELECT 
  COUNT(*) FILTER (WHERE from_county) as county,
  COUNT(*) FILTER (WHERE from_polygon) as polygon,
  COUNT(*) FILTER (WHERE from_city) as city,
  COUNT(*) FILTER (WHERE from_polygon AND from_city) as intersection
FROM weather_alert_zipcodes
WHERE alert_id = 'xyz';
```

**Find alerts where polygon filtering significantly reduces ZIPs:**
```sql
WITH strategy_counts AS (
  SELECT 
    alert_id,
    COUNT(*) FILTER (WHERE from_county) as county_count,
    COUNT(*) FILTER (WHERE from_polygon) as polygon_count
  FROM weather_alert_zipcodes
  GROUP BY alert_id
)
SELECT 
  w.event,
  w.area_desc,
  sc.county_count,
  sc.polygon_count,
  ROUND(100.0 * sc.polygon_count / sc.county_count, 1) as reduction_pct
FROM strategy_counts sc
JOIN weather_alerts w ON sc.alert_id = w.id
WHERE sc.polygon_count < sc.county_count * 0.5  -- More than 50% reduction
ORDER BY reduction_pct;
```

## Testing and Validation

### Pre-Deployment Testing
1. ✅ Compile-time checks (TypeScript types match)
2. ✅ Linter checks passed
3. ✅ Migration syntax validated

### Post-Deployment Validation
Run `scripts/validate-zip-provenance.sql` queries to verify:
- No orphaned flags (all ZIPs have ≥1 flag TRUE)
- Distribution patterns match expectations
- Indexes are being used
- Per-alert stats are reasonable

See `scripts/ROLLOUT_CHECKLIST.md` for detailed validation steps.

## Future Enhancements

### Potential Strategy Improvements
- **Dynamic strategy selection** based on event type or severity
- **Confidence scores** instead of binary flags
- **Geocoding validation** against external APIs

### Additional Metadata
Could extend flags with:
- `confidence_score NUMERIC` - computed metric for ZIP relevance
- `distance_from_centroid_km NUMERIC` - for polygon matches
- `city_names TEXT[]` - which cities matched (for city strategy)

### Consumer Features
- Dashboard UI toggle for different strategies
- A/B testing different strategies for outreach campaigns
- ML model training on historical alert/ZIP pairs

## Rollout Status

- [ ] Migration applied to staging
- [ ] Validation queries passed in staging
- [ ] Crawler deployed to staging
- [ ] Initial staging ingestion successful
- [ ] Migration applied to production
- [ ] Crawler deployed to production
- [ ] Initial production ingestion successful
- [ ] Validation queries passed in production
- [ ] Downstream consumers updated to use flags

## Support

For questions or issues:
1. Check `ZIP_REFINEMENT_EXPERIMENT.md` for query patterns
2. Check `ROLLOUT_CHECKLIST.md` for deployment steps
3. Run validation queries from `validate-zip-provenance.sql`
4. Review crawler logs for strategy breakdown output

