-- Add references tracking to weather_alerts table
-- This enables tracking of alert updates and supersession chains

-- Add columns for tracking alert relationships
ALTER TABLE weather_alerts
ADD COLUMN IF NOT EXISTS message_type TEXT,
ADD COLUMN IF NOT EXISTS "references" JSONB,
ADD COLUMN IF NOT EXISTS superseded_by TEXT,
ADD COLUMN IF NOT EXISTS is_superseded BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for finding superseded alerts
CREATE INDEX IF NOT EXISTS idx_weather_alerts_superseded_by 
  ON weather_alerts(superseded_by) 
  WHERE superseded_by IS NOT NULL;

-- Index for finding current (non-superseded) alerts
CREATE INDEX IF NOT EXISTS idx_weather_alerts_is_superseded 
  ON weather_alerts(is_superseded) 
  WHERE is_superseded = FALSE;

-- Index for querying by message type
CREATE INDEX IF NOT EXISTS idx_weather_alerts_message_type 
  ON weather_alerts(message_type);

-- Comments
COMMENT ON COLUMN weather_alerts.message_type IS 
  'NWS message type: Alert, Update, Cancel, etc.';

COMMENT ON COLUMN weather_alerts."references" IS 
  'Array of previous alert IDs that this alert updates/replaces (from NWS API)';

COMMENT ON COLUMN weather_alerts.superseded_by IS 
  'ID of the alert that supersedes/replaces this one (derived from references chain)';

COMMENT ON COLUMN weather_alerts.is_superseded IS 
  'TRUE if this alert has been replaced by a newer version';

