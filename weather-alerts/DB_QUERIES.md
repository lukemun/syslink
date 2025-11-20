# Weather Alerts Database Queries & Operations

This document provides common SQL queries and operational patterns for the `weather_alerts` table.

## Table Schema Overview

```sql
-- One row per NWS alert
CREATE TABLE weather_alerts (
  id TEXT PRIMARY KEY,              -- NWS alert identifier
  event TEXT NOT NULL,              -- Event type (e.g. "Tornado Warning")
  status TEXT NOT NULL,             -- actual/exercise/system/test/draft
  severity TEXT,                    -- extreme/severe/moderate/minor/unknown
  certainty TEXT,                   -- observed/likely/possible/unlikely/unknown
  urgency TEXT,                     -- immediate/expected/future/past/unknown
  area_desc TEXT,                   -- Human-readable area description
  nws_office TEXT,                  -- Issuing NWS office
  sent TIMESTAMPTZ NOT NULL,        -- When alert was sent
  effective TIMESTAMPTZ NOT NULL,   -- When alert became effective
  onset TIMESTAMPTZ,                -- When hazard begins/began
  expires TIMESTAMPTZ,              -- When alert expires
  is_damaged BOOLEAN NOT NULL,      -- Damage-relevant flag (computed)
  raw JSONB NOT NULL,               -- Full alert feature as JSON
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Common Queries

### 1. Current Damage-Relevant Alerts

Get all active, damage-relevant alerts that haven't expired:

```sql
SELECT id, event, severity, certainty, area_desc, sent, expires
FROM weather_alerts
WHERE is_damaged = TRUE
  AND (expires IS NULL OR expires > NOW())
ORDER BY sent DESC;
```

### 2. Alerts by Event Type

Find all tornado warnings in the last 7 days:

```sql
SELECT id, event, severity, area_desc, sent, effective, expires
FROM weather_alerts
WHERE event ILIKE '%tornado%'
  AND sent > NOW() - INTERVAL '7 days'
ORDER BY sent DESC;
```

### 3. Alerts for a Specific Area

Search by area description (case-insensitive):

```sql
SELECT id, event, severity, area_desc, sent, expires
FROM weather_alerts
WHERE area_desc ILIKE '%california%'
  AND is_damaged = TRUE
ORDER BY sent DESC
LIMIT 50;
```

### 4. Recent High-Severity Alerts

Get extreme or severe alerts from the past 24 hours:

```sql
SELECT id, event, severity, certainty, area_desc, sent
FROM weather_alerts
WHERE severity IN ('Extreme', 'Severe')
  AND sent > NOW() - INTERVAL '24 hours'
ORDER BY sent DESC;
```

### 5. Alert Count by Event Type

Aggregate statistics:

```sql
SELECT 
  event,
  COUNT(*) as total_count,
  SUM(CASE WHEN is_damaged THEN 1 ELSE 0 END) as damaged_count,
  MAX(sent) as most_recent
FROM weather_alerts
WHERE sent > NOW() - INTERVAL '30 days'
GROUP BY event
ORDER BY total_count DESC;
```

### 6. Inspect Full Alert JSON

View the raw alert payload for detailed analysis:

```sql
SELECT 
  id,
  event,
  raw->>'properties'->>'headline' as headline,
  raw->>'properties'->>'description' as description,
  raw->>'properties'->>'instruction' as instruction
FROM weather_alerts
WHERE id = 'urn:oid:...' -- Replace with actual alert ID
LIMIT 1;
```

Or access nested JSONB directly:

```sql
SELECT 
  id,
  event,
  raw->'properties'->>'headline' as headline,
  raw->'properties'->'geocode'->>'SAME' as same_codes
FROM weather_alerts
WHERE is_damaged = TRUE
LIMIT 10;
```

## Data Retention

### Option A: Keep All Historical Alerts

No cleanup needed; useful for long-term analytics and trend analysis.

### Option B: Periodic Cleanup of Expired Alerts

Archive or delete alerts that expired more than 30 days ago:

```sql
-- Preview what would be deleted
SELECT COUNT(*), MIN(expires), MAX(expires)
FROM weather_alerts
WHERE expires < NOW() - INTERVAL '30 days';

-- Actually delete (run with caution!)
DELETE FROM weather_alerts
WHERE expires < NOW() - INTERVAL '30 days';
```

### Option C: Archive to Separate Table

Before deleting, move old alerts to an archive:

```sql
-- Create archive table (one-time)
CREATE TABLE weather_alerts_archive (LIKE weather_alerts INCLUDING ALL);

-- Move expired alerts to archive
WITH moved AS (
  DELETE FROM weather_alerts
  WHERE expires < NOW() - INTERVAL '30 days'
  RETURNING *
)
INSERT INTO weather_alerts_archive SELECT * FROM moved;
```

## Debugging & Inspection

### Check Recent Ingest Activity

```sql
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as alerts_added,
  SUM(CASE WHEN is_damaged THEN 1 ELSE 0 END) as damaged_added
FROM weather_alerts
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

### Find Alerts Missing Key Fields

```sql
SELECT id, event, severity, certainty, expires
FROM weather_alerts
WHERE severity IS NULL 
   OR certainty IS NULL
LIMIT 20;
```

### Identify Duplicate Alert IDs (Should Not Happen)

```sql
SELECT id, COUNT(*)
FROM weather_alerts
GROUP BY id
HAVING COUNT(*) > 1;
```

## Performance Indexes

The table includes these indexes for common queries:

```sql
-- Event + severity for filtering
CREATE INDEX idx_weather_alerts_event_severity 
  ON weather_alerts(event, severity);

-- Time-based queries
CREATE INDEX idx_weather_alerts_sent 
  ON weather_alerts(sent DESC);

CREATE INDEX idx_weather_alerts_effective 
  ON weather_alerts(effective DESC);

-- Damage-relevant filtering
CREATE INDEX idx_weather_alerts_is_damaged 
  ON weather_alerts(is_damaged) 
  WHERE is_damaged = TRUE;

-- Expiration-based cleanup
CREATE INDEX idx_weather_alerts_expires 
  ON weather_alerts(expires) 
  WHERE expires IS NOT NULL;
```

## Maintenance

### Vacuum and Analyze

After large deletes or updates, run:

```sql
VACUUM ANALYZE weather_alerts;
```

### Check Table Size

```sql
SELECT 
  pg_size_pretty(pg_total_relation_size('weather_alerts')) as total_size,
  pg_size_pretty(pg_relation_size('weather_alerts')) as table_size,
  pg_size_pretty(pg_indexes_size('weather_alerts')) as indexes_size;
```

