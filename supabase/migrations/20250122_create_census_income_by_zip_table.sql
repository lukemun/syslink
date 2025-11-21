-- Create census_income_by_zip table for storing 2023 ACS income data by ZIP code
-- One row per ZIP code with key income metrics for lead scoring

CREATE TABLE IF NOT EXISTS census_income_by_zip (
  -- 5-digit US ZIP code (primary key)
  zip CHAR(5) PRIMARY KEY,
  
  -- Geographic identifiers
  name TEXT, -- ZCTA name from census
  state CHAR(2), -- Derived state code (can be populated later)
  county_name TEXT, -- Derived county name (can be populated later)
  
  -- Household income metrics (key for scoring)
  total_households INTEGER,
  median_household_income INTEGER,
  mean_household_income INTEGER,
  per_capita_income INTEGER,
  
  -- Income distribution (for percentile calculations)
  hh_income_under_10k INTEGER,
  hh_income_10k_15k INTEGER,
  hh_income_15k_25k INTEGER,
  hh_income_25k_35k INTEGER,
  hh_income_35k_50k INTEGER,
  hh_income_50k_75k INTEGER,
  hh_income_75k_100k INTEGER,
  hh_income_100k_150k INTEGER,
  hh_income_150k_200k INTEGER,
  hh_income_200k_plus INTEGER,
  
  -- Poverty metrics (for scoring)
  pct_people_poverty NUMERIC(5, 2), -- Percentage as decimal (e.g., 15.5 for 15.5%)
  pct_families_poverty NUMERIC(5, 2),
  
  -- Earnings metrics
  median_earnings_workers INTEGER,
  mean_earnings INTEGER,
  
  -- Wealth indicator (from enhanced CSV if available)
  pct_wealthy_households NUMERIC(5, 2), -- Percentage of households earning $200k+
  
  -- Data year
  year INTEGER NOT NULL DEFAULT 2023,
  
  -- Audit timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick lookups by zip (already covered by PK)
-- Index for filtering by income brackets
CREATE INDEX IF NOT EXISTS idx_census_income_median 
  ON census_income_by_zip(median_household_income) 
  WHERE median_household_income IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_census_income_poverty 
  ON census_income_by_zip(pct_people_poverty) 
  WHERE pct_people_poverty IS NOT NULL;

-- Trigger to auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_census_income_by_zip_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_census_income_by_zip_updated_at
  BEFORE UPDATE ON census_income_by_zip
  FOR EACH ROW
  EXECUTE FUNCTION update_census_income_by_zip_updated_at();

-- Comment on table and key columns
COMMENT ON TABLE census_income_by_zip IS 
  'Stores US Census American Community Survey (ACS) 5-year income data by ZIP code. Used for enriching weather alert leads with economic context for scoring and targeting.';

COMMENT ON COLUMN census_income_by_zip.zip IS 
  '5-digit US ZIP code, zero-padded to match format used in weather_alert_zipcodes table';

COMMENT ON COLUMN census_income_by_zip.median_household_income IS 
  'Median household income in dollars for this ZIP code from ACS 5-year estimates';

COMMENT ON COLUMN census_income_by_zip.pct_people_poverty IS 
  'Percentage of people below poverty line, stored as decimal (e.g., 15.5 for 15.5%)';

COMMENT ON COLUMN census_income_by_zip.pct_wealthy_households IS 
  'Percentage of households earning $200k or more, used as a wealth indicator';

