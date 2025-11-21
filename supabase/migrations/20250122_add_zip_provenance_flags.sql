-- Add provenance flags to weather_alert_zipcodes to track which filtering strategy identified each ZIP
-- This enables experimental comparison and flexible querying of different ZIP refinement strategies:
--   - county: Baseline ZIPs from SAME code → FIPS → county mappings
--   - polygon: ZIPs filtered by alert geometry boundary using centroid point-in-polygon tests
--   - city: ZIPs filtered by city names extracted from alert text

ALTER TABLE weather_alert_zipcodes
  ADD COLUMN IF NOT EXISTS from_county BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS from_polygon BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS from_city BOOLEAN NOT NULL DEFAULT FALSE;

-- Add partial indexes for common query patterns
-- Polygon-based queries (production use case)
CREATE INDEX IF NOT EXISTS idx_weather_alert_zipcodes_polygon 
  ON weather_alert_zipcodes(zipcode) 
  WHERE from_polygon = TRUE;

-- High-confidence intersection queries (polygon + city)
CREATE INDEX IF NOT EXISTS idx_weather_alert_zipcodes_polygon_city 
  ON weather_alert_zipcodes(zipcode) 
  WHERE from_polygon = TRUE AND from_city = TRUE;

-- City-based queries (experimental)
CREATE INDEX IF NOT EXISTS idx_weather_alert_zipcodes_city 
  ON weather_alert_zipcodes(zipcode) 
  WHERE from_city = TRUE;

-- Update table comment to document the new provenance flags
COMMENT ON TABLE weather_alert_zipcodes IS 
  'Join table mapping weather alerts to affected ZIP codes with provenance flags. One row per (alert_id, zipcode) pair. Each ZIP may be identified by multiple strategies: county (baseline SAME→FIPS), polygon (geometry-filtered), and/or city (text-extracted). Enables flexible querying and comparison of ZIP refinement strategies.';

-- Add column comments for the new provenance flags
COMMENT ON COLUMN weather_alert_zipcodes.from_county IS 
  'TRUE if this ZIP was identified via baseline county (FIPS) mapping from NWS SAME codes. This is the broadest filtering strategy.';

COMMENT ON COLUMN weather_alert_zipcodes.from_polygon IS 
  'TRUE if this ZIP was identified via polygon geometry filtering using centroid point-in-polygon tests. More precise than county-based alone.';

COMMENT ON COLUMN weather_alert_zipcodes.from_city IS 
  'TRUE if this ZIP was identified via city name matching from alert text (headline, description, areaDesc). Experimental strategy for high-precision targeting.';


