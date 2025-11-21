-- Create weather_alerts table for storing NWS alerts with damage relevance tracking
-- One row per alert, identified by NWS alert ID, with high-level columns plus full JSON payload

CREATE TABLE IF NOT EXISTS weather_alerts (
  -- Primary identifier from NWS (properties.id or feature.id)
  id TEXT PRIMARY KEY,
  
  -- Key alert properties for fast filtering
  event TEXT NOT NULL,
  status TEXT NOT NULL,
  severity TEXT,
  certainty TEXT,
  urgency TEXT,
  
  -- Geographic and descriptive info
  area_desc TEXT,
  nws_office TEXT,
  
  -- Temporal fields
  sent TIMESTAMPTZ NOT NULL,
  effective TIMESTAMPTZ NOT NULL,
  onset TIMESTAMPTZ,
  expires TIMESTAMPTZ,
  
  -- Derived damage relevance flag
  -- Set to TRUE when alert meets all config-based criteria:
  --   - status = 'actual'
  --   - severity in ['extreme', 'severe']
  --   - certainty in ['observed', 'likely']
  --   - event in DAMAGE_EVENT_CONFIG.primaryUsed
  --   - at least one keyword match from weather_damage_triggers_extended.csv
  is_damaged BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Full alert feature as JSON for flexibility
  raw JSONB NOT NULL,
  
  -- Audit timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_weather_alerts_event_severity 
  ON weather_alerts(event, severity);

CREATE INDEX IF NOT EXISTS idx_weather_alerts_sent 
  ON weather_alerts(sent DESC);

CREATE INDEX IF NOT EXISTS idx_weather_alerts_effective 
  ON weather_alerts(effective DESC);

CREATE INDEX IF NOT EXISTS idx_weather_alerts_is_damaged 
  ON weather_alerts(is_damaged) 
  WHERE is_damaged = TRUE;

CREATE INDEX IF NOT EXISTS idx_weather_alerts_expires 
  ON weather_alerts(expires) 
  WHERE expires IS NOT NULL;

-- Trigger to auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_weather_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_weather_alerts_updated_at
  BEFORE UPDATE ON weather_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_weather_alerts_updated_at();

-- Comment on table and key columns
COMMENT ON TABLE weather_alerts IS 
  'Stores NWS weather alerts with one row per alert. Includes high-level columns for common queries plus full raw JSON payload. is_damaged flag indicates potential property damage relevance based on configured criteria.';

COMMENT ON COLUMN weather_alerts.id IS 
  'NWS alert identifier from feature.properties.id or feature.id';

COMMENT ON COLUMN weather_alerts.is_damaged IS 
  'TRUE if alert meets damage-relevance criteria: actual status, extreme/severe severity, observed/likely certainty, damage-capable event type, and keyword match';

COMMENT ON COLUMN weather_alerts.raw IS 
  'Full GeoJSON feature object including all properties and geometry';


