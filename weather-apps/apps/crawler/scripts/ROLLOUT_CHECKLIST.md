# ZIP Provenance Flags Rollout Checklist

This checklist guides the rollout of the new ZIP provenance flags (`from_county`, `from_polygon`, `from_city`) in the `weather_alert_zipcodes` table.

## Pre-Deployment

- [ ] Review migration: `supabase/migrations/20250120_add_zip_provenance_flags.sql`
- [ ] Verify all code changes compile without errors
- [ ] Confirm `db.ts` exports `ZipcodeWithFlags` interface
- [ ] Confirm `ingest.ts` imports and uses `ZipcodeWithFlags`

## Staging Deployment

### 1. Apply Migration
```bash
# Apply the migration to staging database
supabase db push --db-url <STAGING_DATABASE_URL>
```

### 2. Verify Schema Changes
```sql
-- Check that columns were added
\d weather_alert_zipcodes

-- Verify indexes were created
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'weather_alert_zipcodes' 
  AND indexname LIKE '%polygon%' OR indexname LIKE '%city%';
```

Expected columns:
- `from_county BOOLEAN NOT NULL DEFAULT FALSE`
- `from_polygon BOOLEAN NOT NULL DEFAULT FALSE`
- `from_city BOOLEAN NOT NULL DEFAULT FALSE`

Expected indexes:
- `idx_weather_alert_zipcodes_polygon`
- `idx_weather_alert_zipcodes_polygon_city`
- `idx_weather_alert_zipcodes_city`

### 3. Deploy Crawler Code
```bash
cd weather-apps/apps/crawler
npm run build
# Deploy to staging environment
```

### 4. Run Initial Ingestion
```bash
# Run crawler in staging with dry-run to verify logging
DRY_RUN=1 npm run dev

# If dry-run looks good, run actual ingestion
npm run dev
```

### 5. Validate Data

Run validation queries from `scripts/validate-zip-provenance.sql`:

#### Critical Checks (must pass):
- [ ] **No orphaned flags**: Query #4 returns 0 rows
- [ ] **All strategies represented**: Query #2 shows non-zero counts for `county_count`, `polygon_count`
- [ ] **Reasonable distributions**: Query #5 shows expected flag combinations
- [ ] **Index usage**: Query #10 shows index scans (not seq scans) for partial indexes

#### Expected Patterns:
- [ ] `county_count` should be highest (baseline includes all ZIPs)
- [ ] `polygon_count` should be 20-80% of `county_count` (geometry filtering reduces set)
- [ ] `city_count` varies widely (0-100% depending on whether cities are mentioned)
- [ ] `polygon_city_intersection` > 0 for alerts that mention cities

#### Spot Checks:
- [ ] Review Query #3 output: per-alert stats look reasonable
- [ ] Review Query #8 output: manually verify a few ZIPs with multiple flags make sense
- [ ] Review Query #9 output: polygon filtering effectiveness by event type

### 6. Monitor Logs

Check crawler logs for new strategy breakdown output:
```
✓ [1] Tornado Warning
  Alert ID: ...
  Total unique ZIPs: 87
  Strategy breakdown:
    County (baseline): 245 ZIPs
    Polygon-filtered: 87 ZIPs (35% of baseline)
    City-filtered: 52 ZIPs (21% of baseline)
    Polygon ∩ City: 42 ZIPs (high-confidence core)
```

Expected:
- [ ] All alerts show strategy breakdown
- [ ] Counts are reasonable (not all zeros, not absurdly high)
- [ ] City detection works for alerts with city mentions

## Production Deployment

### 1. Review Staging Results
- [ ] All critical checks passed in staging
- [ ] No unexpected errors in crawler logs
- [ ] Data distributions look reasonable

### 2. Apply Migration to Production
```bash
supabase db push --db-url <PRODUCTION_DATABASE_URL>
```

### 3. Deploy Crawler Code to Production
```bash
cd weather-apps/apps/crawler
npm run build
# Deploy to production environment
```

### 4. Monitor Initial Production Run
- [ ] Check logs for errors
- [ ] Verify strategy breakdowns appear in logs
- [ ] Run validation queries (Query #1, #2, #4) after first successful run

### 5. Validate Production Data
- [ ] Run full validation suite (`validate-zip-provenance.sql`)
- [ ] Compare distributions to staging (should be similar)
- [ ] Spot-check a few alerts manually

## Post-Deployment

### Update Downstream Consumers
- [ ] Update dashboard/API queries to use `from_polygon = TRUE` as default filter
- [ ] Document query patterns for different use cases (see `ZIP_REFINEMENT_EXPERIMENT.md`)
- [ ] Consider adding UI toggle for different ZIP filtering strategies

### Optional: Backfill Historical Data
If you want to populate flags for existing alerts:

```sql
-- Note: This is a placeholder. Actual backfill would require
-- re-running ZIP computation logic or keeping historical geometries
UPDATE weather_alert_zipcodes
SET from_county = TRUE
WHERE from_county = FALSE AND from_polygon = FALSE AND from_city = FALSE;
```

Better approach: Run a one-off script that re-fetches recent alerts and recomputes ZIP sets.

### Monitoring and Tuning
- [ ] Monitor query performance on partial indexes
- [ ] Track usage of different flag filters in application logs
- [ ] Gather feedback on precision/recall trade-offs from users
- [ ] Consider adjusting default strategy based on alert type or severity

## Rollback Plan

If issues arise:

### Quick Rollback (revert to old behavior):
1. Deploy previous version of crawler code (ignore new flags, write all ZIPs with flags = FALSE)
2. Queries without flag filters will still work (returns all ZIPs)

### Full Rollback (remove columns):
```sql
-- Only if necessary - this loses data
ALTER TABLE weather_alert_zipcodes
  DROP COLUMN from_county,
  DROP COLUMN from_polygon,
  DROP COLUMN from_city;

DROP INDEX IF EXISTS idx_weather_alert_zipcodes_polygon;
DROP INDEX IF EXISTS idx_weather_alert_zipcodes_polygon_city;
DROP INDEX IF EXISTS idx_weather_alert_zipcodes_city;
```

## Success Criteria

- ✅ Migration applied successfully to both staging and production
- ✅ No orphaned flags (all ZIPs have at least one flag TRUE)
- ✅ Strategy distributions match expectations from `ZIP_REFINEMENT_DEBUG` experiments
- ✅ Crawler runs without errors and logs strategy breakdowns
- ✅ Partial indexes are being used for filtered queries
- ✅ Downstream queries can filter by strategy flags
- ✅ No performance degradation from additional columns or indexes

## Notes

- The flags are **additive**: they don't break existing queries that don't filter on them
- Multiple flags can be TRUE for a single ZIP (e.g., both `from_county` and `from_polygon`)
- Consumers can choose their own precision/recall trade-off by selecting different flag combinations
- The `ZIP_REFINEMENT_DEBUG=1` mode still works for detailed experimental logging

