# California Weather Alerts

Fetch active weather alerts for California from the National Weather Service API.

## Quickstart: Alerts → ZIPs → Income (Nationwide)

Minimal commands to go from live alerts to income stats:

```bash
# Navigate to scripts directory
cd scripts

# 1) Fetch alerts (currently scoped to CA)
node fetch-california-alerts.js

# 2) Build nationwide FIPS/ZIP lookup tables
node download-geo-data.js
node build-lookups.js

# 3) Translate alerts to ZIPs and join with income data
node translate-geo-to-locations.js
node alert-income-analysis.js
```

The last command writes an `*-income-analysis.json` file next to your alerts,
containing weighted household income stats for each alert.

## Overview

This script retrieves real-time weather alerts, warnings, and advisories for California from the [NWS API](https://www.weather.gov/documentation/services-web-api) and saves them as a GeoJSON FeatureCollection.

## Usage

### Run the Script

```bash
node fetch-california-alerts.js
```

### Output

The script will:
1. Fetch all active alerts for California (state code: `CA`)
2. Display a summary in the console with:
   - Total alert count
   - Breakdown by severity (Extreme, Severe, Moderate, Minor, Unknown)
   - Recent alerts preview
3. Save the full dataset to `california-alerts.json`

### Output Format

The saved JSON file is a [GeoJSON FeatureCollection](https://tools.ietf.org/html/rfc7946) where each alert is a Feature containing:

- **Geometry**: Polygon coordinates (WGS84 lat/lon) defining the affected area, or `null` if not provided
- **Properties**: Alert metadata including:
  - `event`: Alert type (e.g., "Wind Advisory", "Flood Warning")
  - `severity`: `Extreme`, `Severe`, `Moderate`, `Minor`, `Unknown`
  - `certainty`: `Observed`, `Likely`, `Possible`, `Unlikely`
  - `urgency`: `Immediate`, `Expected`, `Future`, `Past`
  - `areaDesc`: Human-readable location description
  - `headline`: Brief alert summary
  - `description`: Detailed alert information
  - `instruction`: Recommended actions
  - `effective`, `onset`, `expires`, `ends`: Time boundaries
  - `geocode`: Contains:
    - `SAME`: FIPS/SAME codes for emergency alert systems
    - `UGC`: NWS zone identifiers
  - `affectedZones`: URLs to fetch detailed zone geometries

## API Details

- **Endpoint**: `https://api.weather.gov/alerts/active?area=CA`
- **Rate Limits**: The NWS API has fair-use rate limits; avoid excessive requests
- **User-Agent**: Required by the API (currently set to placeholder—update in script)
- **Data Format**: GeoJSON-LD (JSON-LD with GeoJSON context + NWS wx vocabulary)

## Geo Data Available

Each alert includes multiple layers of geographic information:

| Data Type | Field | Description | Example |
|-----------|-------|-------------|---------|
| **Polygon** | `geometry.coordinates` | Precise WGS84 boundaries | `[[-118.84, 34.03], ...]` |
| **Text Description** | `properties.areaDesc` | Human-readable location | "Malibu Coast; Santa Monica Mountains" |
| **County Codes** | `properties.geocode.SAME` | FIPS codes for EAS | `["006037", "006111"]` |
| **NWS Zones** | `properties.geocode.UGC` | Weather zone IDs | `["CAZ362", "CAZ369"]` |
| **Zone URLs** | `properties.affectedZones` | Links to zone metadata | `https://api.weather.gov/zones/forecast/CAZ362` |
| **Storm Motion** | `parameters.eventMotionDescription` | Movement vector (for storms) | `"2025-11-16T18:01:00Z...storm...224DEG...4KT...34.05,-118.78"` |

## Examples

### Check for severe alerts

```bash
node fetch-california-alerts.js
# Look for "Extreme" or "Severe" in the severity breakdown
```

### Process alerts programmatically

```javascript
const { fetchFromAPI } = require('./fetch-california-alerts.js');

async function getExtremeAlerts() {
  const data = await fetchFromAPI('/alerts/active?area=CA');
  return data.features.filter(f => 
    f.properties.severity === 'Extreme'
  );
}
```

## Customization

To fetch alerts for a different state, change the `state` in the CONFIG object:

```javascript
const CONFIG = {
  // ...
  state: 'NY', // New York
  // ...
};
```

Valid state codes: Two-letter postal abbreviations (e.g., `TX`, `FL`, `AK`)

## Translating Geo Data to Zip Codes & Counties (Nationwide)

There is a small pipeline that turns **NWS alerts** into **ZIP codes** and then joins on ACS income data.

### 1. Download Reference Data

```bash
node weather-alerts/download-geo-data.js
```

This will:
- Download `national_county.txt` (Census FIPS counties)
- Attempt to download the HUD ZIP-COUNTY crosswalk (you may still need to download it manually and drop it into `weather-alerts/data/raw/`).

### 2. Build Lookup Tables

```bash
node weather-alerts/build-lookups.js
```

This reads from `weather-alerts/data/raw/` and creates JSON lookup files in `weather-alerts/data/processed/`:
- `fips-to-county.json` (FIPS → county name/state)
- `fips-to-zips.json` (FIPS → ZIPs with residential ratios)
- `zip-to-fips.json` (ZIP → FIPS with residential ratios)

### 3. Translate Alerts → ZIP Codes

```bash
node weather-alerts/translate-geo-to-locations.js
```

This analyzes `california-alerts.json` and converts **SAME codes** (FIPS county codes) to:
- County names (nationwide)
- Associated ZIP codes (via HUD crosswalk)
- Detailed breakdown saved to `location-analysis.json`

You can control ZIP filtering with an environment variable:

```bash
# Include all ZIPs (default)
node weather-alerts/translate-geo-to-locations.js

# Option 1: only ZIPs where at least 80% of residential addresses are in-county
RES_RATIO_THRESHOLD=0.8 node weather-alerts/translate-geo-to-locations.js
```

Internally, this script uses the shared helpers in `alert-to-zips.js`. You can also import them directly:

```javascript
import { sameCodesToZips, alertToZips } from './alert-to-zips.js';

const { zips } = sameCodesToZips(['06037']); // Los Angeles County
```

### 4. Join Alerts with Income Data

```bash
node weather-alerts/alert-income-analysis.js
```

This script:
- Loads `california-alerts.json`
- Uses `alert-to-zips.js` to translate each alert into ZIP codes
- Joins with `census-acs-income-2023/processed/wealth_by_zip_enhanced.csv`
- Writes weighted income stats per alert to `california-alerts-income-analysis.json`

You can run it against another alerts file:

```bash
RES_RATIO_THRESHOLD=0.8 node weather-alerts/alert-income-analysis.js path/to/alerts.json
```

See **[TRANSLATION-GUIDE.md](./TRANSLATION-GUIDE.md)** for:
- How to use SAME codes → counties → ZIP codes
- Complete FIPS database sources
- HUD crosswalk for county-to-ZIP mapping
- Production-ready implementation options

## Resources

- [NWS API Documentation](https://www.weather.gov/documentation/services-web-api)
- [API Specification (OpenAPI)](https://api.weather.gov/openapi.json)
- [GeoJSON Format](https://geojson.org/)
- [NWS Alerts Feed](https://alerts.weather.gov/)
- [Census FIPS Codes](https://www.census.gov/geographies/reference-files/2020/demo/popest/2020-fips.html)
- [HUD Zip-County Crosswalk](https://www.huduser.gov/portal/datasets/usps_crosswalk.html)

## Notes

- Some alerts may have `geometry: null` (especially marine/coastal zones)—use `geocode` and `affectedZones` to resolve locations
- Alerts are updated continuously; fetch frequency depends on your use case
- The `@context` field includes JSON-LD semantics for programmatic interpretation

