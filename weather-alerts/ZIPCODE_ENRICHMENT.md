# Weather Alert Zipcode Enrichment

## Overview

The weather alert system includes zipcode enrichment to map NWS (National Weather Service) alerts to affected ZIP codes. This allows for precise geographic targeting and enables queries like "What alerts affect ZIP code 90001?" or "What ZIP codes are affected by this alert?"

## Architecture

### Database Schema

The enrichment uses a normalized join table approach:

- **`weather_alerts`** - Main alerts table (one row per alert)
- **`weather_alert_zipcodes`** - Join table mapping alerts to ZIP codes (many-to-many)

#### Table: `weather_alert_zipcodes`

```sql
CREATE TABLE weather_alert_zipcodes (
  id BIGSERIAL PRIMARY KEY,
  alert_id TEXT NOT NULL REFERENCES weather_alerts(id) ON DELETE CASCADE,
  zipcode CHAR(5) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(alert_id, zipcode)
);
```

**Key Features:**
- Foreign key with `ON DELETE CASCADE` ensures cleanup when alerts are removed
- Unique constraint prevents duplicate `(alert_id, zipcode)` pairs
- Indexes on `alert_id` (primary access pattern) and `zipcode` (reverse lookup)

### Data Flow

1. **Fetch** - `fetch-active-alerts.js` downloads alerts from NWS API
2. **Ingest** - `ingest-active-alerts.ts` processes alerts:
   - Upserts alerts into `weather_alerts` table
   - Extracts SAME codes (FIPS county codes) from `properties.geocode.SAME`
   - Uses `alert-to-zips.js` to convert SAME codes to ZIP codes
   - Upserts ZIP code mappings into `weather_alert_zipcodes`
3. **Query** - Applications can query zipcode mappings via helper functions

### Zipcode Derivation

ZIP codes are derived from NWS SAME (Specific Area Message Encoding) codes using:

1. **SAME to FIPS**: NWS provides FIPS county codes in alert geocode data
2. **FIPS to ZIP**: Pre-built lookup tables map counties to ZIP codes
3. **Filtering**:
   - Residential ratio threshold (default: 0.5) - only include ZIPs at least 50% in county
   - Polygon refinement - when alert geometry is available, filter to ZIPs within the polygon
4. **Deduplication**: Unique constraint ensures no duplicate mappings

## API Reference

### Database Functions

Located in `weather-alerts/db/alertsDb.ts`:

#### `upsertAlertZipcodes(alertId: string, zipcodes: string[]): Promise<void>`

Upsert zipcode mappings for a single alert. Idempotent - safe to call multiple times.

```typescript
import { upsertAlertZipcodes } from './db/alertsDb.js';

await upsertAlertZipcodes('alert-123', ['90001', '90002', '90003']);
```

#### `getZipcodesForAlert(alertId: string): Promise<string[]>`

Get all ZIP codes affected by a specific alert.

```typescript
import { getZipcodesForAlert } from './db/alertsDb.js';

const zipcodes = await getZipcodesForAlert('alert-123');
// Returns: ['90001', '90002', '90003']
```

#### `getAlertsForZipcode(zipcode: string): Promise<string[]>`

Get all alert IDs that affect a specific ZIP code (reverse lookup).

```typescript
import { getAlertsForZipcode } from './db/alertsDb.js';

const alerts = await getAlertsForZipcode('90001');
// Returns: ['alert-123', 'alert-456', ...]
```

#### `getAllAlerts(): Promise<Array<{ id: string; raw: any }>>`

Get all alerts from the database with their IDs and raw GeoJSON data.

```typescript
import { getAllAlerts } from './db/alertsDb.js';

const alerts = await getAllAlerts();
// Returns: [{ id: 'alert-123', raw: {...} }, ...]
```

## CLI Tools

### Query Tool

`query-alert-zipcodes.ts` provides a command-line interface for querying zipcode mappings.

```bash
# Get all zipcodes for a specific alert
node --loader ts-node/esm weather-alerts/query-alert-zipcodes.ts alert <alert-id>

# Get all alerts affecting a specific zipcode
node --loader ts-node/esm weather-alerts/query-alert-zipcodes.ts zipcode <zipcode>

# Get statistics on zipcode coverage
node --loader ts-node/esm weather-alerts/query-alert-zipcodes.ts stats
```

### Test Suite

`test-zipcode-enrichment.ts` provides integration tests for the zipcode enrichment system.

```bash
# Run all tests
node --loader ts-node/esm weather-alerts/test-zipcode-enrichment.ts
```

Tests verify:
- Upsert idempotency (no duplicates)
- Reverse lookup functionality
- Foreign key constraints
- Unique constraints

## Usage Examples

### Example 1: Enrich a single alert

```typescript
import { alertToZips } from './alert-to-zips.js';
import { upsertAlertZipcodes } from './db/alertsDb.js';

const alert = {
  id: 'alert-123',
  properties: {
    id: 'alert-123',
    geocode: {
      SAME: ['06037', '06059'] // Los Angeles and Orange counties
    }
  },
  geometry: { /* GeoJSON polygon */ }
};

// Convert SAME codes to ZIP codes
const zipResult = alertToZips(alert, {
  residentialRatioThreshold: 0.5,
  geometry: alert.geometry
});

console.log(`Alert affects ${zipResult.zips.length} ZIP codes`);

// Store in database
await upsertAlertZipcodes(alert.id, zipResult.zips);
```

### Example 2: Query alerts for a user's location

```typescript
import { getAlertsForZipcode } from './db/alertsDb.js';

const userZipcode = '90001';
const alerts = await getAlertsForZipcode(userZipcode);

if (alerts.length > 0) {
  console.log(`⚠️ ${alerts.length} active weather alerts for ${userZipcode}`);
} else {
  console.log('✓ No active alerts');
}
```

### Example 3: Generate coverage report

```typescript
import { getAllAlerts, getZipcodesForAlert } from './db/alertsDb.js';

const alerts = await getAllAlerts();

for (const alert of alerts) {
  const zipcodes = await getZipcodesForAlert(alert.id);
  console.log(`${alert.id}: ${zipcodes.length} ZIP codes`);
}
```

## Configuration

### Residential Ratio Threshold

Controls which ZIP codes are included based on how much of the ZIP's area falls within the county:

- `0.0` - Include all ZIPs that touch the county
- `0.5` - Only include ZIPs at least 50% in the county (default)
- `0.8` - Only include ZIPs mostly in the county (more conservative)

Set in `ingest-active-alerts.ts`:

```typescript
const zipResult = alertToZips(feature, {
  residentialRatioThreshold: 0.5, // Adjust as needed
  geometry: feature.geometry,
});
```

## Maintenance

### Adding Zipcode Enrichment to Existing Alerts

If you need to enrich existing alerts that don't have zipcode mappings:

1. The ingest script (`ingest-active-alerts.ts`) automatically enriches all alerts it processes
2. Run the ingest script to refresh alerts and their zipcodes
3. The upsert logic ensures no duplicates are created

### Monitoring and Logging

#### Enrichment Logs

The ingest script provides detailed logging for each alert:

```bash
npx tsx weather-alerts/ingest-active-alerts.ts
```

**Success logs** show:
- Event type
- Alert ID
- SAME codes used
- Number of zipcodes mapped
- Sample ZIP codes

**Failure logs** show:
- Event type and area description
- SAME codes attempted
- Specific reason for failure:
  - No SAME codes in alert
  - SAME codes not in lookup tables
  - Marine/offshore zones (no ZIP mappings)
  - Filtered out by threshold/geometry

**Summary section** provides:
- Total enriched vs skipped
- Average zipcodes per alert
- Detailed failure breakdown

Example output:
```
=== Enrichment Summary ===
✓ Successfully enriched: 7 alerts
  Total zipcode mappings: 89
  Average per alert: 12.7 zipcodes
✗ Skipped/Failed: 2 alerts

=== Failure Details ===
1. Storm Warning
   Alert: ...aedbe5bf9fb09aa2a2a4be2ad6bdf1edb2.002.1
   Area: Sitkinak to Castle Cape out to 15 NM
   SAME: [058750]
   Reason: SAME codes found but no ZIP mappings (likely marine/offshore zone: 058750)
```

#### Coverage Statistics

Use the stats command to monitor overall coverage:

```bash
npx tsx weather-alerts/query-alert-zipcodes.ts stats
```

Expected output:
```
=== Zipcode Coverage Statistics ===
Total alerts in database: 10
Alerts with zipcode mappings: 7
Total zipcode mappings: 89
Average zipcodes per alert: 12.7

Top 10 alerts by zipcode count:
  1. alert-abc123: 68 zipcodes
  2. alert-def456: 7 zipcodes
  ...
```

## Performance Considerations

- **Batch Size**: Zipcode upserts are batched per alert (typically 20-100 zipcodes per batch)
- **Indexes**: Three indexes support efficient queries:
  - `idx_weather_alert_zipcodes_alert_zip` (unique) - prevents duplicates
  - `idx_weather_alert_zipcodes_alert_id` - fast lookup of zipcodes per alert
  - `idx_weather_alert_zipcodes_zipcode` - fast reverse lookup of alerts per zipcode
- **Cascade Delete**: When an alert is deleted, all zipcode mappings are automatically cleaned up
- **Idempotency**: Safe to re-run enrichment multiple times without creating duplicates

## Troubleshooting

### No zipcodes found for an alert

The enhanced logging will tell you exactly why an alert failed to map to zipcodes:

**Common causes:**
1. **Marine/offshore zones** - SAME codes like `058750` represent ocean areas with no ZIP codes (this is expected)
2. **No SAME codes** - Alert has no `properties.geocode.SAME` field
3. **Missing lookup data** - SAME codes not in `fips-to-zips.json` lookup tables
4. **Threshold filtering** - Residential ratio threshold (0.5) filtered out all potential ZIPs
5. **Geometry filtering** - Alert polygon excludes all potential ZIP centroids

**Solutions:**
- For marine zones: This is expected behavior; consider adding a flag to track marine alerts
- For missing lookup data: Check if the FIPS code represents a territory or special zone
- For threshold issues: Lower the `residentialRatioThreshold` in `ingest-active-alerts.ts`
- For geometry issues: Verify the alert's GeoJSON geometry is valid

### Duplicate zipcode mappings

Should not occur due to unique constraint, but if you see issues:

```sql
-- Check for duplicates (should return 0 rows)
SELECT alert_id, zipcode, COUNT(*)
FROM weather_alert_zipcodes
GROUP BY alert_id, zipcode
HAVING COUNT(*) > 1;
```

### Performance degradation

If queries are slow:

```sql
-- Verify indexes exist
SELECT indexname, tablename 
FROM pg_indexes 
WHERE tablename = 'weather_alert_zipcodes';

-- Check table size
SELECT pg_size_pretty(pg_total_relation_size('weather_alert_zipcodes'));
```

## Migration History

- **20250119_create_weather_alerts_table.sql** - Created main alerts table
- **20250119_create_weather_alert_zipcodes_table.sql** - Created zipcode join table with FK, indexes, and constraints

