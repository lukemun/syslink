# Translating Weather Alert Geo Data to Zip Codes & Counties

## Overview

Weather alerts include **non-polygon identifiers** that can be translated to zip codes and counties:

1. **SAME Codes** (FIPS County Codes) → Counties → Zip Codes
2. **UGC Codes** → NWS Zone API → Counties/Geometry
3. **areaDesc** → Text parsing (less reliable)

## Quick Start

```bash
node translate-geo-to-locations.js
```

This analyzes `california-alerts.json` and outputs:
- Counties affected by each alert
- Associated zip codes
- Detailed breakdown saved to `location-analysis.json`

## Translation Methods

### Method 1: SAME Codes → Counties → Zip Codes (Recommended)

**SAME codes are FIPS county codes** in format `SSCCC`:
- `SS` = State FIPS code (e.g., `06` = California)
- `CCC` = County FIPS code (e.g., `037` = Los Angeles)

#### Example from Alert Data

```json
{
  "geocode": {
    "SAME": ["006037", "006111"],
    "UGC": ["CAZ366", "CAZ368"]
  }
}
```

**Translation:**
- `006037` → Los Angeles County → 95 zip codes (90001-90099)
- `006111` → Ventura County → 38 zip codes (93001-93067)

#### Implementation

```javascript
// 1. Get SAME codes from alert
const sameCodes = alert.properties.geocode.SAME; // ["006037"]

// 2. Look up county using FIPS database
const county = fipsDatabase[sameCodes[0]]; // "Los Angeles County, CA"

// 3. Look up zip codes using HUD Crosswalk
const zipCodes = hudCrosswalk.getZipsByCounty("06", "037");
// Returns: ["90001", "90002", ..., "90099"]
```

### Method 2: UGC Codes → NWS Zone API

**UGC codes** identify NWS forecast zones. Fetch geometry and metadata:

```javascript
// UGC code from alert
const ugcCode = "CAZ366"; // Los Angeles County Beaches

// Fetch zone details
const zoneUrl = `https://api.weather.gov/zones/forecast/${ugcCode}`;
const response = await fetch(zoneUrl);
const zoneData = await response.json();

// Extract info
console.log(zoneData.properties.name); // "Los Angeles County Beaches"
console.log(zoneData.properties.state); // "CA"
console.log(zoneData.geometry); // GeoJSON polygon
```

The zone geometry can be used with point-in-polygon to find zip codes.

### Method 3: Area Description Text Parsing

Less reliable but useful as fallback:

```javascript
const areaDesc = alert.properties.areaDesc;
// "Los Angeles, CA; Ventura, CA"

// Simple parsing
const counties = areaDesc.split(';').map(s => {
  const match = s.trim().match(/^([^,]+),\s*([A-Z]{2})/);
  return match ? { name: match[1], state: match[2] } : null;
}).filter(Boolean);
```

## Data Sources for Production

### 1. FIPS County Codes

**Source:** U.S. Census Bureau

**Download:**
```bash
# County FIPS codes with names
curl -o fips-counties.txt \
  https://www2.census.gov/geo/docs/reference/codes/files/national_county.txt
```

**Format:** CSV with columns:
```
STATE,STATEFP,COUNTYFP,COUNTYNAME,CLASSFP
CA,06,001,Alameda County,H1
CA,06,037,Los Angeles County,H1
```

**Parse to JSON:**
```javascript
// Create mapping: "006037" -> { county: "Los Angeles", state: "CA" }
const fipsMap = {};
csvRows.forEach(row => {
  const [state, stateFp, countyFp, countyName] = row.split(',');
  const fipsCode = stateFp + countyFp;
  fipsMap[fipsCode] = { 
    county: countyName.replace(' County', ''), 
    state 
  };
});
```

### 2. County to Zip Code Crosswalk

**Source:** HUD USPS ZIP Code Crosswalk Files

**Download:**
```bash
# Quarterly updated crosswalk (latest)
curl -o zip-county-crosswalk.xlsx \
  https://www.huduser.gov/portal/datasets/usps/ZIP_COUNTY_122023.xlsx
```

**Format:** Excel with columns:
```
ZIP     | COUNTY | STATE | ...
90001   | 037    | 06    | ...
90002   | 037    | 06    | ...
```

**Alternative - Use Census ZCTA:**
```bash
# Zip Code Tabulation Areas (ZCTAs) with geometries
curl -o zcta-2020.zip \
  https://www2.census.gov/geo/tiger/TIGER2020/ZCTA5/tl_2020_us_zcta510.zip
```

### 3. Complete SAME/FIPS Database

**Pre-built API Option:**

The FCC provides a SAME code database API:
```bash
curl "https://transition.fcc.gov/pshs/services/cацима/same.txt"
```

**JSON Database for Node.js:**

Use npm package `zipcodes` or `us`:
```bash
npm install zipcodes us
```

```javascript
import zipcodes from 'zipcodes';
import us from 'us';

// Get county by FIPS
const county = us.lookup.fips('06037'); // Los Angeles County

// Get zips in county
const zips = zipcodes.lookupByState('CA').filter(z => 
  z.county === 'Los Angeles'
);
```

## Implementation Options

### Option A: SQLite Database (Recommended for Scale)

Build a local SQLite database with FIPS, county, and zip data:

```sql
CREATE TABLE fips_counties (
  fips_code TEXT PRIMARY KEY,
  state TEXT,
  state_fips TEXT,
  county_fips TEXT,
  county_name TEXT
);

CREATE TABLE county_zips (
  zip TEXT,
  fips_code TEXT,
  PRIMARY KEY (zip, fips_code),
  FOREIGN KEY (fips_code) REFERENCES fips_counties(fips_code)
);

CREATE INDEX idx_county_zips_fips ON county_zips(fips_code);
```

**Query:**
```javascript
import Database from 'better-sqlite3';

const db = new Database('geo-data.db');
const zips = db.prepare(`
  SELECT zip FROM county_zips WHERE fips_code = ?
`).all('006037');
```

### Option B: JSON Lookup Files

Store mappings as JSON (simpler, good for < 100MB data):

```javascript
// fips-to-county.json
{
  "006037": {
    "county": "Los Angeles",
    "state": "CA",
    "zips": ["90001", "90002", ...]
  }
}
```

### Option C: External APIs

Use third-party geocoding APIs (simpler but requires network):

1. **Census Geocoder** (Free, rate-limited)
   ```javascript
   const url = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates';
   const params = `?x=-118.2437&y=34.0522&benchmark=4&vintage=4`;
   // Returns county FIPS
   ```

2. **ZipCodeAPI** (Commercial)
   ```javascript
   // Get county by zip
   const res = await fetch('https://www.zipcodeapi.com/rest/API_KEY/info.json/90001');
   ```

## Example: Full Translation Pipeline

```javascript
import { readFile } from 'fs/promises';
import Database from 'better-sqlite3';

async function alertToZipCodes(alert) {
  // Load geo database
  const db = new Database('geo-data.db');
  
  // Get SAME codes
  const sameCodes = alert.properties.geocode.SAME;
  
  // Query all zip codes
  const allZips = [];
  for (const fips of sameCodes) {
    const zips = db.prepare(
      'SELECT zip FROM county_zips WHERE fips_code = ?'
    ).all(fips);
    allZips.push(...zips.map(r => r.zip));
  }
  
  return {
    event: alert.properties.event,
    severity: alert.properties.severity,
    counties: sameCodes.map(fips => {
      const county = db.prepare(
        'SELECT county_name FROM fips_counties WHERE fips_code = ?'
      ).get(fips);
      return county?.county_name;
    }),
    zipCodes: [...new Set(allZips)] // unique
  };
}
```

## Performance Considerations

| Method | Speed | Accuracy | Offline | Best For |
|--------|-------|----------|---------|----------|
| SAME → County → Zip | Fast | High | Yes | Production |
| UGC → NWS API | Slow | High | No | Detailed zones |
| Text parsing | Fast | Medium | Yes | Fallback |
| Polygon → ZCTA | Slow | Highest | Yes | Precision needed |

## Real-World Example

From current California alerts:

```javascript
// Alert: Winter Weather Advisory
const alert = {
  properties: {
    event: "Winter Weather Advisory",
    areaDesc: "Yosemite NP; Upper San Joaquin River; ...",
    geocode: {
      SAME: ["006039", "006043", "006109", "006019", "006107", "006029"]
    }
  }
};

// Translation result:
{
  counties: ["Madera", "Mariposa", "Tuolumne", "Fresno", "Tulare", "Kern"],
  zipCodes: ["93601", "93602", ..., "93314"], // 120 total
  affectedPopulation: 2500000 // if you join with population data
}
```

## Next Steps

1. **Download FIPS database** from Census Bureau
2. **Download HUD Crosswalk** for county→zip mapping
3. **Build SQLite or JSON lookup** for your app
4. **Use the included script** as a starting point

The `translate-geo-to-locations.js` script demonstrates the basic pattern. Extend it with complete databases for production use.

