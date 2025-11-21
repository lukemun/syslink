<!-- f4e5ddd8-07c2-4e65-bec1-008bda6db217 942a0980-ee94-48c7-aade-342ff4a13cef -->
# Plan: Integrate uszips.csv into ZIP Refinement (Centroids + Cities) — Logging Only

### 1. Clarify data sources and roles

- Use `apps/crawler/src/uszips.csv` as the **single source of truth** for:
- ZIP → centroid (`lat`, `lng`)
- ZIP → city (`city`)
- ZIP → state (`state_id`)
- ZIP → county FIPS (`county_fips`)
- Treat `ZIP_Code_Population_Weighted_Centroids_...csv` as optional/backup for now (no code integration until needed).

### 2. Design target JSON formats under `data/processed/`

- `zip-centroids.json`
- Shape: `{ [zip: string]: { lat: number; lon: number } }`
- Example:
- `{ "90001": { "lat": 33.9731, "lon": -118.2479 }, ... }`
- Purpose: consumed by `geometryContainsZip` in `alert-to-zips.ts` for polygon filtering.
- `zip-to-city.json`
- Shape: `{ [zip: string]: { city: string; state: string; county_fips: string } }`
- Example:
- `{ "90001": { "city": "Los Angeles", "state": "CA", "county_fips": "06037" }, ... }`
- Purpose: consumed by `filterZipsByCities` to map city names to ZIPs.

### 3. Plan a small build script to generate JSON from CSV

- Add a script under `apps/crawler/scripts/` (e.g. `build-zip-lookups.ts` or `.js`) that:
- Reads `src/uszips.csv` using a CSV parser (or manual splitting if kept simple).
- Iterates each row, normalizing:
- `zip` → 5-character string with leading zeros preserved.
- `lat`/`lng` → numbers.
- `city` → trimmed string; may also store lowercase version for matching.
- `state_id` and `county_fips` as-is.
- Writes out:
- `apps/crawler/src/data/processed/zip-centroids.json`
- `apps/crawler/src/data/processed/zip-to-city.json`
- Hook script into `apps/crawler/package.json`:
- Add `"build-zip-lookups": "tsx scripts/build-zip-lookups.ts"` (or Node equivalent).
- Document that it should be run when `uszips.csv` is updated.

### 4. Wire centroids into `alert-to-zips.ts` for polygon filtering (logging only)

- Update `alert-to-zips.ts` LOOKUPS:
- Import `zip-centroids.json` next to existing FIPS lookups.
- Set `LOOKUPS.zipCentroids` to the imported JSON instead of `null`.
- Keep **production behavior unchanged**:
- `alertToZips` will still return the ZIPs used for `upsertAlertZipcodes` as today.
- Polygon centroids will only be used when computing **experimental `polygonZips`** inside the ingest logging path guarded by `ZIP_REFINEMENT_DEBUG`.
- Confirm behavior of `geometryContainsZip`:
- With centroids present, it will be used for polygon filtering in the experiment.
- Without geometry, or if a ZIP has no centroid, function behaves as currently documented (pass-through or exclusion).

### 5. Implement real city-based filtering using `zip-to-city.json` (logging only)

- Update `filterZipsByCities` in `zip-refinement.ts` to:
- Import `zip-to-city.json` (similar pattern to other JSON imports).
- Normalize parsed cities from `extractCitiesFromDescription` (e.g. lowercase, strip punctuation).
- For each `zip ∈ countyZips`, keep it if:
- `zipToCity[zip]` exists, and
- its `city` (case-insensitive) matches one of the parsed city names, and optionally `state` matches the alert’s state when available.
- Keep this **strictly for logging**:
- `cityZips` is computed only under `ZIP_REFINEMENT_DEBUG` inside ingest.
- `cityZips` is never passed to `upsertAlertZipcodes` or stored in the database.

### 6. Validate the data linkage with existing FIPS-based lookups

- Spot-check a few ZIPs from `uszips.csv` and existing `fips-to-zips.json`:
- Confirm `county_fips` in `uszips.csv` matches the FIPS codes used in lookup tables.
- This ensures centroids and city mapping are consistent with current FIPS/ZIP relationships.
- Optionally add a small sanity-check script or test that:
- For a sample of FIPS codes, all ZIPs from `fips-to-zips.json` exist in `zip-centroids.json` / `zip-to-city.json`.

### 7. Ensure ingest pipeline uses new filters for logging only

- In `ingest.ts` (already partially instrumented):
- Continue to use **only** `zipResult.zips` (county-based) for `upsertAlertZipcodes`.
- Under `ZIP_REFINEMENT_DEBUG=1`, compute:
- `allCountyZips` (no geometry) as the baseline universe.
- `polygonZips` using `geometryContainsZip` + centroids.
- `cityZips` using `filterZipsByCities` + `zip-to-city.json`.
- Pass these sets into `computeZipSetStats` and `logZipRefinement`.
- Confirm there is **no code path** where `polygonZips` or `cityZips` are written to `weather_alert_zipcodes`.

### 8. Update experiment docs and README for logging-only behavior

- Update `ZIP_REFINEMENT_EXPERIMENT.md` and `weather-apps/README.md` to:
- Emphasize that polygon and city strategies are **logging-only** experiments.
- Clarify that `ZIP_REFINEMENT_DEBUG=1` controls experimental logging, not production mappings.
- Note that the only persisted ZIPs remain the county-based ones until a future, explicit decision to change that.

### 9. Plan follow-up production decisions

- After running with real centroids and city filtering for some time (logging only):
- Analyze how much polygon and city filters reduce ZIP counts for damage-relevant alerts.
- Decide whether and how to change production behavior in a **separate, clearly scoped change**:
- e.g., use `polygonZips` as the new default when available, or
- use intersection `polygonZips ∩ cityZips` for high-confidence cores.
- Document the decision and, only then, plan a follow-up implementation to wire chosen strategy into `upsertAlertZipcodes`.

### To-dos

- [x] Review uszips.csv columns and confirm they map cleanly to zip-centroids and zip-to-city JSON needs (zip, lat, lng, city, state_id, county_fips).