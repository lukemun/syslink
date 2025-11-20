# Weather Alerts Database Integration

This system fetches active NWS alerts, filters them for property-damage relevance, and stores them in a Postgres/Supabase table for easy querying and analysis.

## Overview

The workflow consists of three main steps:

1. **Fetch** active alerts from NWS API → `active-alerts.json`
2. **Ingest** alerts into Postgres with damage evaluation → `weather_alerts` table
3. **Query** the database for damage-relevant alerts and analytics

## Components

### 1. Database Schema

**Table**: `weather_alerts`

- **Location**: `supabase/migrations/20250119_create_weather_alerts_table.sql`
- **Purpose**: Stores one row per alert with high-level columns + full JSON payload
- **Key columns**:
  - `id` (primary key) - NWS alert identifier
  - `event`, `severity`, `certainty`, `urgency` - Alert classification
  - `area_desc`, `nws_office` - Geographic info
  - `sent`, `effective`, `onset`, `expires` - Temporal fields
  - `is_damaged` (boolean) - Computed damage-relevance flag
  - `raw` (jsonb) - Full alert feature for flexibility

**Apply the migration**:

```bash
# If using Supabase CLI
supabase db push

# Or run the SQL directly via psql/pgAdmin
psql $DATABASE_URL -f supabase/migrations/20250119_create_weather_alerts_table.sql
```

### 2. TypeScript DB Utilities

**Module**: `weather-alerts/db/alertsDb.ts`

Provides:
- `AlertRow` interface matching the schema
- `getPool()` - Postgres connection pool management
- `upsertAlerts(alerts: AlertRow[])` - Batch upsert helper
- `closePool()` - Clean shutdown

Uses `pg` package and requires `DATABASE_URL` environment variable.

### 3. Ingestion Script

**Script**: `weather-alerts/ingest-active-alerts.ts`

**What it does**:
1. Reads `active-alerts.json` (output of `fetch-active-alerts.js`)
2. Loads damage keywords from `weather_damage_triggers_extended.csv`
3. For each alert:
   - Maps fields to AlertRow
   - Computes `is_damaged` based on:
     - Config filters (severity, certainty, event type)
     - Keyword matching in headline/description/instruction
4. Upserts all rows into `weather_alerts` table

**Usage**:

```bash
# Fetch latest alerts first
node weather-alerts/fetch-active-alerts.js

# Then ingest into database
node --loader ts-node/esm weather-alerts/ingest-active-alerts.ts

# With verbose damage evaluation logs
DEBUG_DAMAGE=1 node --loader ts-node/esm weather-alerts/ingest-active-alerts.ts
```

## How `is_damaged` is Determined

An alert gets `is_damaged = true` when **all** of these are true:

1. **Status**: `actual` (not a test or exercise)
2. **Severity**: `extreme` or `severe` (from `USED_FILTERS.client.severity`)
3. **Certainty**: `observed` or `likely` (from `USED_FILTERS.client.certainty`)
4. **Event type**: One of the events in `DAMAGE_EVENT_CONFIG.primaryUsed` (e.g. `Tornado Warning`, `Flash Flood Warning`, `Hurricane Warning`, etc.)
5. **Keyword match**: At least one phrase from `weather_damage_triggers_extended.csv` appears in the alert's `headline`, `description`, or `instruction`

All configuration for steps 2-4 lives in `alert-params-config.js`, and step 5 uses the CSV's `keywords_to_match` column.

When `DEBUG_DAMAGE=1` is set, the ingest script logs each damage-relevant alert showing which checks passed and which keyword matched.

## Querying the Database

See **[DB_QUERIES.md](./DB_QUERIES.md)** for:
- Common SQL queries (current damage alerts, event type filters, area searches)
- Data retention strategies (keep all vs periodic cleanup)
- Debugging patterns (ingest activity, missing fields, duplicates)
- Performance tips (indexes, vacuum, table size)

Quick example:

```sql
-- All current damage-relevant tornado warnings
SELECT id, event, severity, area_desc, sent, expires
FROM weather_alerts
WHERE is_damaged = TRUE
  AND event ILIKE '%tornado%'
  AND (expires IS NULL OR expires > NOW())
ORDER BY sent DESC;
```

## Environment Setup

**Required**:
- `DATABASE_URL` - Postgres connection string (e.g. from Supabase project settings)
  - Create a `.env` file in the project root with:
    ```
    DATABASE_URL=postgresql://user:password@host:5432/dbname
    ```
  - For Supabase, get this from: Project Settings → Database → Connection string (use connection pooling)
  - The `alertsDb.ts` module automatically loads this from `.env`

**Optional**:
- `DEBUG_DAMAGE=1` - Enable verbose is_damaged determination logs
- `DEBUG_EVENTS=1` - Show which NWS event types appeared but weren't in damage config (for `fetch-active-alerts.js`)

## Data Flow Summary

```
┌────────────────────────────────────────────┐
│ NWS API                                    │
│ https://api.weather.gov/alerts/active     │
└────────────────┬───────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────┐
│ fetch-active-alerts.js                     │
│ Filters by:                                │
│ - status=actual                            │
│ - severity ∈ {extreme, severe}             │
│ - certainty ∈ {observed, likely}           │
│ - event ∈ DAMAGE_EVENT_CONFIG.primaryUsed  │
└────────────────┬───────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────┐
│ active-alerts.json                         │
│ (filtered GeoJSON feature collection)     │
└────────────────┬───────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────┐
│ ingest-active-alerts.ts                    │
│ For each alert:                            │
│ 1. Map fields to AlertRow                  │
│ 2. Check keyword match from CSV            │
│ 3. Set is_damaged flag                     │
│ 4. Upsert into weather_alerts              │
└────────────────┬───────────────────────────┘
                 │
                 ▼
┌────────────────────────────────────────────┐
│ Postgres: weather_alerts table             │
│ - One row per alert                        │
│ - is_damaged boolean for fast filtering   │
│ - raw JSONB for full alert details         │
└────────────────────────────────────────────┘
```

## Typical Workflow

### Initial Setup

```bash
# 1. Install dependencies (from project root)
npm install

# 2. Create .env file in project root
cat > .env << EOF
DATABASE_URL=postgresql://user:password@host:5432/dbname
EOF

# 3. Apply database migration
supabase db push
# or: psql $DATABASE_URL -f supabase/migrations/20250119_create_weather_alerts_table.sql
```

### Regular Operation

```bash
# Fetch latest alerts from NWS
node weather-alerts/fetch-active-alerts.js

# Ingest into database
node --loader ts-node/esm weather-alerts/ingest-active-alerts.ts

# Query for insights
psql $DATABASE_URL -c "SELECT COUNT(*) FROM weather_alerts WHERE is_damaged = TRUE;"
```

### Periodic Maintenance

```bash
# Check table size
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_total_relation_size('weather_alerts'));"

# Clean up expired alerts (optional)
psql $DATABASE_URL -c "DELETE FROM weather_alerts WHERE expires < NOW() - INTERVAL '30 days';"

# Vacuum after large deletes
psql $DATABASE_URL -c "VACUUM ANALYZE weather_alerts;"
```

## Troubleshooting

### "DATABASE_URL environment variable is required"

Create a `.env` file in the project root:

```bash
# In /Users/lukemunro/Clones/syslink/.env
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

For Supabase, find this in Project Settings → Database → Connection string (use the "connection pooling" variant for best performance).

The `alertsDb.ts` module automatically loads this from `.env` at the project root.

### "Table weather_alerts does not exist"

Run the migration:

```bash
supabase db push
# or manually: psql $DATABASE_URL -f supabase/migrations/20250119_create_weather_alerts_table.sql
```

### "No damage-relevant alerts found"

- Check that `weather_damage_triggers_extended.csv` exists and has keyword phrases
- Run with `DEBUG_DAMAGE=1` to see why alerts are being filtered out
- Verify `USED_FILTERS` and `DAMAGE_EVENT_CONFIG` in `alert-params-config.js` match your needs

### TypeScript/ts-node errors

Make sure you have ts-node installed:

```bash
npm install --save-dev ts-node typescript @types/node @types/pg
```

Or use tsx as an alternative loader:

```bash
npx tsx weather-alerts/ingest-active-alerts.ts
```

## Next Steps

- Set up a cron job or scheduled task to run fetch + ingest regularly (e.g. every 15 minutes)
- Build a dashboard/UI that queries `weather_alerts WHERE is_damaged = TRUE`
- Add geographic filtering by cross-referencing `area_desc` or SAME codes in `raw->'properties'->'geocode'`
- Integrate with external APIs (property data, demographic data) using the stored alerts as triggers

