# Alert Deduplication & Update History Implementation

## Overview

Implemented NWS alert supersession tracking to automatically group related alerts (updates/continuations) and display them as expandable rows in the dashboard. Marine/offshore alerts with no zip codes are now filtered out by default.

## Changes Made

### 1. Database Schema Updates

**New Migration:** `supabase/migrations/20250120_add_alert_references.sql`

Added four new columns to `weather_alerts` table:
- `message_type` TEXT - NWS message type (Alert, Update, Cancel, etc.)
- `"references"` JSONB - Array of previous alert IDs this alert updates/replaces
- `superseded_by` TEXT - ID of the alert that supersedes this one
- `is_superseded` BOOLEAN - TRUE if this alert has been replaced by a newer version

**Indexes created:**
- `idx_weather_alerts_superseded_by` - For finding superseded alerts
- `idx_weather_alerts_is_superseded` - For finding current (non-superseded) alerts
- `idx_weather_alerts_message_type` - For querying by message type

### 2. Ingestion Script Updates

**File:** `weather-alerts/ingest-active-alerts.ts`

- Extracts `references` array from NWS alert properties
- Extracts `message_type` from alert properties
- Calls new `updateSupersessionChain()` function after all alerts are upserted
- Sets `is_superseded` and `superseded_by` based on reference chain

**File:** `weather-alerts/db/alertsDb.ts`

- Updated `AlertRow` interface to include new fields
- Updated `upsertAlerts` to insert new columns (quoted `"references"` to avoid SQL keyword conflict)
- Added `updateSupersessionChain()` function that:
  - Finds all alerts with references
  - Marks referenced (older) alerts as superseded
  - Sets the `superseded_by` field to point to the newer alert

### 3. Shared Query Functions

**File:** `shared/alertsDb.ts`

- Updated `EnrichedAlert` interface to include:
  - `message_type`
  - `is_superseded`
  - `superseded_by`
  - `updates?: EnrichedAlert[]` - Array of previous versions

- Added `getActiveAlertsWithHistory()` function:
  - Returns only non-superseded (current) alerts
  - For each alert, fetches all alerts it has superseded
  - Attaches superseded alerts as `updates` array
  - Supports `includeMarine` option to filter out alerts with no zip codes

### 4. Frontend UI Updates

**New Component:** `alerts-dashboard/components/ExpandableAlertRow.tsx`

- Client component with expand/collapse functionality
- Shows chevron icon for alerts with updates
- Displays update count badge (e.g., "(2 updates)")
- Shows `message_type` if it's not the default "Alert"
- Expandable sub-rows show previous versions with:
  - Blue-tinted background (`bg-blue-50`)
  - Indented content
  - "(Previous version)" label
  - Full alert details including zip codes and severity

**Updated:** `alerts-dashboard/app/alerts/page.tsx`

- Changed from `getActiveAlertsForUI()` to `getActiveAlertsWithHistory()`
- Replaced inline `AlertRow` component with `ExpandableAlertRow`
- Set `includeMarine: false` to filter out marine/offshore alerts by default

### 5. Other Improvements

**Fixed:** Lowered `residentialRatioThreshold` from 0.5 to 0.01 in `ingest-active-alerts.ts`
- This fixed the issue where Arizona flood warnings had no zip codes
- Rural counties often have zip codes that span multiple FIPS codes with low ratios in each

## How It Works

### Alert Update Flow

1. **NWS publishes an alert** with `messageType: "Alert"`
   - Gets ingested with `is_superseded = FALSE`
   - No references

2. **NWS publishes an update** with `messageType: "Update"` and `references: ["original-alert-id"]`
   - Gets ingested with references array
   - `updateSupersessionChain()` is called
   - Original alert is marked with `is_superseded = TRUE` and `superseded_by = "update-alert-id"`

3. **Dashboard queries for active alerts**
   - `getActiveAlertsWithHistory()` fetches only `is_superseded = FALSE` alerts
   - For each, it finds all alerts with `superseded_by = current_alert_id`
   - Returns enriched alerts with `updates` array

4. **UI displays alerts**
   - Shows current version in main row
   - Shows chevron and update count if updates exist
   - User can click to expand and see previous versions

### Deduplication Examples

**Before (duplicate issue):**
```
Flash Flood Warning - 1:20 PM - 4:30 PM - No zip codes
Flash Flood Warning - 4:21 PM - 7:30 PM - 71 zip codes (same area)
```

**After (with update history):**
```
Flash Flood Warning - 4:21 PM - 7:30 PM - 71 zip codes (1 update) [expandable]
  └─ Flash Flood Warning - 1:20 PM - 4:30 PM - No zip codes (Previous version)
```

**Before (Alaska duplicates):**
```
Winter Storm Warning - St Lawrence Island - 11:21 PM
Winter Storm Warning - St Lawrence Island - 11:21 PM (same alert ID)
Winter Storm Warning - St Lawrence Island - 4:42 PM (update)
```

**After:**
```
Winter Storm Warning - St Lawrence Island - 4:42 PM (1 update) [expandable]
  └─ Winter Storm Warning - St Lawrence Island - 11:21 PM (Previous version)
```

## Marine Alert Filtering

Marine/offshore alerts (e.g., "Sitkinak to Castle Cape out to 15 NM") have SAME codes that map to marine zones with no land-based zip codes. These are now filtered out by default using the `includeMarine: false` option.

**Filtered example:**
- Storm Warning - Sitkinak to Castle Cape out to 15 NM (SAME: 058750) - No zip codes

This can be toggled in the future by adding a UI checkbox that sets `includeMarine: true`.

## Database Query Performance

The new indexes ensure efficient queries:
- Finding current alerts: Uses `idx_weather_alerts_is_superseded WHERE is_superseded = FALSE`
- Finding update history: Uses `idx_weather_alerts_superseded_by WHERE superseded_by = 'alert-id'`
- Both are indexed lookups, not table scans

## Testing

Run ingestion to populate the new fields:
```bash
cd weather-alerts
npx tsx ingest-active-alerts.ts
```

View updated dashboard:
```bash
cd alerts-dashboard
npm run dev
# Visit http://localhost:3000/alerts
```

## Future Enhancements

1. **Add Cancel tracking** - Show cancelled alerts in strikethrough or separate section
2. **Timeline view** - Visual timeline of alert updates with arrows
3. **Marine toggle** - UI checkbox to show/hide marine alerts
4. **Diff view** - Highlight what changed between versions (zip codes added/removed, time extended, etc.)
5. **Alert chains** - Show full chain if A→B→C (multiple updates)

## Files Modified

### Database
- `supabase/migrations/20250120_add_alert_references.sql` (new)

### Backend
- `weather-alerts/db/alertsDb.ts`
- `weather-alerts/ingest-active-alerts.ts`

### Shared
- `shared/alertsDb.ts`

### Frontend
- `alerts-dashboard/components/ExpandableAlertRow.tsx` (new)
- `alerts-dashboard/app/alerts/page.tsx`

## Summary

✅ **Deduplication** - Uses NWS `references` field to track alert updates  
✅ **Update History** - Expandable rows show previous versions  
✅ **Marine Filtering** - Removes offshore alerts with no zip codes  
✅ **Performance** - Indexed queries for supersession chain lookups  
✅ **UI Polish** - Clear visual distinction between current and previous versions  
✅ **Zip Code Fix** - Lowered threshold to capture rural county zip codes  

The dashboard now correctly handles alert continuations and updates, presenting a clean, deduplicated view while preserving the full history for users who want to see it.

