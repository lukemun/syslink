# ZIP Refinement Experiment

## Overview

This document describes the experimental ZIP refinement strategies being evaluated to improve the accuracy of alert-to-ZIP mappings in the weather crawler system.

**Important**: All refinement strategies described here are **logging-only experiments**. They do not affect production database writes to `weather_alert_zipcodes`.

## Current Production Behavior

Production ZIP mappings are based on:
1. **County (FIPS) codes** from NWS SAME codes
2. **Residential ratio filtering** (threshold: 0.5)
3. **Polygon geometry filtering** (when centroids are available and geometry is provided)

The third filter is now active in production since centroids are loaded, but the first two remain the primary strategy.

## Experimental Strategies

### 1. Baseline: County-Based (No Geometry)

- **Source**: FIPS codes from alert's SAME codes → county → all residential ZIPs
- **Purpose**: Establishes the broadest possible ZIP set before refinement
- **Variable**: `allCountyZips`

### 2. Polygon-Based Filtering

- **Source**: County ZIPs filtered by alert polygon geometry using ZIP centroids
- **Data**: `zip-centroids.json` (generated from `uszips.csv`)
- **Method**: Point-in-polygon test for each ZIP's centroid
- **Purpose**: Exclude ZIPs outside the alert's geographic boundary
- **Variable**: `polygonZips` (also `zipResult.zips` in production path)

### 3. City-Based Filtering

- **Source**: County ZIPs filtered by city names extracted from alert text
- **Data**: `zip-to-city.json` (generated from `uszips.csv`)
- **Method**: 
  1. Extract city names from alert headline, description, and areaDesc
  2. Normalize city names (lowercase, remove punctuation)
  3. Keep ZIPs whose city matches extracted cities and alert state
- **Purpose**: Focus on ZIPs in explicitly mentioned cities
- **Variable**: `cityZips`
- **Status**: Experimental logging only

## Data Sources

### Primary: `uszips.csv`

Single source of truth for:
- ZIP → centroid (lat, lng)
- ZIP → city (city)
- ZIP → state (state_id)
- ZIP → county FIPS (county_fips)

Location: `weather-apps/apps/crawler/src/uszips.csv`

### Generated Lookups

Built by `npm run build-zip-lookups` (run in `weather-apps/apps/crawler/`):

1. **`zip-centroids.json`**
   ```json
   {
     "90001": { "lat": 33.9731, "lon": -118.2479 },
     "10001": { "lat": 40.75064, "lon": -73.99728 }
   }
   ```
   - Used by: `geometryContainsZip()` for polygon filtering
   - Location: `src/data/processed/zip-centroids.json`

2. **`zip-to-city.json`**
   ```json
   {
     "90001": { "city": "Los Angeles", "state": "CA", "county_fips": "06037" },
     "10001": { "city": "New York", "state": "NY", "county_fips": "36061" }
   }
   ```
   - Used by: `filterZipsByCities()` for city-based filtering
   - Location: `src/data/processed/zip-to-city.json`

### Backup: `ZIP_Code_Population_Weighted_Centroids_*.csv`

- Status: Available but not integrated
- Purpose: Alternative centroid source if needed in future

## Running the Experiment

### Enable Experimental Logging

**Using command-line parameters (recommended for local testing):**

```bash
cd apps/crawler

# Test with ZIP refinement logging
npm run dev:zip-debug

# Or use the flag directly
node --loader ts-node/esm src/index.ts --dry-run --zip-debug --no-ssl-verify
```

**Using environment variables (for deployment):**

```bash
ZIP_REFINEMENT_DEBUG=1 npm run <your-crawler-command>
```

Or in your deployment configuration:
```bash
export ZIP_REFINEMENT_DEBUG=1
```

### What Gets Logged

When `ZIP_REFINEMENT_DEBUG=1`, for each alert the system logs:

1. **Parsed cities** extracted from alert text
2. **Strategy comparison**:
   - County-based count (baseline)
   - Polygon-filtered count and percentage of baseline
   - City-filtered count and percentage of baseline
3. **Set relationships**:
   - Polygon ∩ City (high-confidence core)
   - Polygon ∪ City (union of both)
   - Polygon-only ZIPs
   - City-only ZIPs
4. **Sample ZIPs** from each strategy (first 10)

### Example Output

```
=== ZIP Refinement Experiment ===
Alert: ...urn:oid:2.49.0.1.840.0.abc123
Event: Tornado Warning
Parsed cities: los angeles, pasadena

Strategy Comparison:
  County-based (baseline):  245 ZIPs
  Polygon-filtered:         87 ZIPs (35% of baseline)
  City-filtered:            52 ZIPs (21% of baseline)

Set Relationships:
  Polygon ∩ City:           42 ZIPs (high-confidence core)
  Polygon ∪ City:           97 ZIPs
  Polygon only:             45 ZIPs
  City only:                10 ZIPs

Sample ZIPs:
  County (first 10):        90001, 90002, 90003, ...
  Polygon (first 10):       90001, 90002, 90012, ...
  City (first 10):          90001, 90012, 90013, ...
=== End ZIP Refinement ===
```

## Implementation Details

### Files Modified

1. **`scripts/build-zip-lookups.ts`** - New script to generate JSON lookups
2. **`utils/alert-to-zips.ts`** - Import centroids, update `geometryContainsZip()`
3. **`utils/zip-refinement.ts`** - New module with city extraction and filtering
4. **`ingest.ts`** - Add experimental logging under `ZIP_REFINEMENT_DEBUG`
5. **`package.json`** - Add `build-zip-lookups` script
6. **`tsconfig.json`** - Enable `resolveJsonModule`

### Key Functions

#### In `utils/zip-refinement.ts`:

- `normalizeCityName(city)` - Normalize for case-insensitive matching
- `extractCitiesFromDescription(text)` - Parse city names from alert text
- `filterZipsByCities(countyZips, parsedCities, alertState)` - City-based filter
- `computeZipSetStats(allCountyZips, polygonZips, cityZips)` - Calculate metrics
- `logZipRefinement(...)` - Format and log experiment results

#### In `utils/alert-to-zips.ts`:

- `geometryContainsZip(zip, geometry)` - Now uses real centroids from JSON

### Production Safety

**Critical**: The experimental code is strictly isolated:

1. `upsertAlertZipcodes(alertId, zipResult.zips)` uses only the standard `alertToZips()` result
2. Experimental `cityZips` are computed only under `ZIP_REFINEMENT_DEBUG`
3. No code path writes `cityZips` to the database
4. Polygon filtering via centroids is used in production but city filtering is not

## Data Quality Validation

### Consistency Check (Optional)

A validation script can spot-check that:
- ZIPs from `fips-to-zips.json` exist in `zip-centroids.json` and `zip-to-city.json`
- County FIPS codes in `uszips.csv` match existing lookup tables

This ensures the new data is consistent with existing FIPS-based mappings.

## Future Production Decisions

### Analysis Goals

Monitor the experiment to determine:
1. How much do polygon and city filters reduce ZIP counts?
2. For damage-relevant alerts, do the filters improve targeting?
3. Are there systematic patterns (e.g., polygon useful for tornados, city for ice storms)?

### Potential Production Changes

After gathering sufficient data, consider:

**Option A**: Use `polygonZips` as default when geometry is available
```typescript
const zipsToWrite = feature.geometry ? polygonZips : allCountyZips;
```

**Option B**: Use high-confidence intersection for critical alerts
```typescript
const zipsToWrite = (severity === 'Extreme') 
  ? intersection(polygonZips, cityZips)
  : polygonZips;
```

**Option C**: Hybrid approach based on event type
```typescript
const zipsToWrite = needsPreciseTargeting(event)
  ? cityZips
  : polygonZips;
```

### Implementation Path

Any production change will:
1. Be implemented in a separate, focused PR
2. Update `ingest.ts` to pass chosen ZIP set to `upsertAlertZipcodes()`
3. Include updated documentation and reasoning
4. Be clearly scoped and reversible

## Updating Data

### When `uszips.csv` Changes

1. Replace `weather-apps/apps/crawler/src/uszips.csv`
2. Run: `cd weather-apps/apps/crawler && npm run build-zip-lookups`
3. Verify outputs in `src/data/processed/`
4. Commit both CSV and generated JSON files

### Files to Commit

- `src/uszips.csv` (source)
- `src/data/processed/zip-centroids.json` (generated)
- `src/data/processed/zip-to-city.json` (generated)

## Database Integration (Production)

### Provenance Flags in `weather_alert_zipcodes`

As of the `20250120_add_zip_provenance_flags` migration, the `weather_alert_zipcodes` table includes three boolean flags per ZIP:

- **`from_county`**: TRUE if the ZIP was identified via baseline county (FIPS) mapping from NWS SAME codes
- **`from_polygon`**: TRUE if the ZIP was identified via polygon geometry filtering using centroid point-in-polygon tests
- **`from_city`**: TRUE if the ZIP was identified via city name matching from alert text

These flags enable flexible querying and analysis without requiring separate tables or complex array operations.

### How ZIPs Are Written

The ingest pipeline now:
1. Computes all three ZIP sets per alert (county, polygon, city)
2. Merges them into a single set with provenance flags
3. Writes all unique ZIPs with their flags to `weather_alert_zipcodes`

A single ZIP can have multiple flags set to TRUE if it was identified by multiple strategies.

### Query Patterns

**Polygon-based queries (recommended default for damage alerts):**
```sql
SELECT zipcode 
FROM weather_alert_zipcodes 
WHERE alert_id = 'xyz' AND from_polygon = TRUE;
```

**High-confidence intersection (polygon + city):**
```sql
SELECT zipcode 
FROM weather_alert_zipcodes 
WHERE alert_id = 'xyz' AND from_polygon = TRUE AND from_city = TRUE;
```

**Baseline county-based:**
```sql
SELECT zipcode 
FROM weather_alert_zipcodes 
WHERE alert_id = 'xyz' AND from_county = TRUE;
```

**Find all alerts affecting a ZIP (with strategy filtering):**
```sql
SELECT alert_id 
FROM weather_alert_zipcodes 
WHERE zipcode = '12345' AND from_polygon = TRUE;
```

**Analysis queries:**
```sql
-- Count ZIPs by strategy for a specific alert
SELECT 
  COUNT(*) FILTER (WHERE from_county) as county_count,
  COUNT(*) FILTER (WHERE from_polygon) as polygon_count,
  COUNT(*) FILTER (WHERE from_city) as city_count,
  COUNT(*) FILTER (WHERE from_polygon AND from_city) as intersection_count
FROM weather_alert_zipcodes
WHERE alert_id = 'xyz';
```

### Indexes

The migration creates partial indexes for common query patterns:
- `idx_weather_alert_zipcodes_polygon` - for polygon queries
- `idx_weather_alert_zipcodes_polygon_city` - for intersection queries
- `idx_weather_alert_zipcodes_city` - for city queries

## Summary

This system provides a production-ready way to store and query different ZIP refinement strategies. All strategies are captured in the database with provenance flags, enabling flexible querying and data-driven decisions about which strategy to use for different alert types or use cases.

**Current production behavior**: All three strategies are computed and stored with flags. Downstream consumers can choose which flags to query based on their precision vs. recall requirements.

