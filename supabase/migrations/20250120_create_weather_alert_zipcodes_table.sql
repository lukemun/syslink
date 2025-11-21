-- Create weather_alert_zipcodes join table for storing zipcode-to-alert mappings
-- One row per (alert_id, zipcode) pair, allowing efficient queries of affected zipcodes per alert
-- and reverse lookups of alerts affecting a specific zipcode

CREATE TABLE IF NOT EXISTS weather_alert_zipcodes (
  -- Primary key
  id BIGSERIAL PRIMARY KEY,
  
  -- Foreign key to weather_alerts, with cascade delete so rows are cleaned up when alert is removed
  alert_id TEXT NOT NULL REFERENCES weather_alerts(id) ON DELETE CASCADE,
  
  -- 5-digit US ZIP code
  zipcode CHAR(5) NOT NULL,
  
  -- Audit timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint to prevent duplicate (alert_id, zipcode) pairs
CREATE UNIQUE INDEX IF NOT EXISTS idx_weather_alert_zipcodes_alert_zip 
  ON weather_alert_zipcodes(alert_id, zipcode);

-- Index for the main access pattern: get all zipcodes for an alert
CREATE INDEX IF NOT EXISTS idx_weather_alert_zipcodes_alert_id 
  ON weather_alert_zipcodes(alert_id);

-- Index for reverse lookup: find alerts affecting a specific zipcode
CREATE INDEX IF NOT EXISTS idx_weather_alert_zipcodes_zipcode 
  ON weather_alert_zipcodes(zipcode);

-- Comment on table and key columns
COMMENT ON TABLE weather_alert_zipcodes IS 
  'Join table mapping weather alerts to affected ZIP codes. One row per (alert_id, zipcode) pair. Enables efficient queries of zipcodes per alert and alerts per zipcode.';

COMMENT ON COLUMN weather_alert_zipcodes.alert_id IS 
  'Foreign key to weather_alerts.id. Cascade delete ensures cleanup when alert is removed.';

COMMENT ON COLUMN weather_alert_zipcodes.zipcode IS 
  '5-digit US ZIP code affected by the alert, derived from NWS SAME codes and geographic boundary data.';


