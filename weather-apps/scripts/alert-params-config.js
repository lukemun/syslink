#!/usr/bin/env node

/**
 * NWS Alert parameter catalog and project-wide filter configuration.
 *
 * Usage & purpose:
 * - `AVAILABLE_PARAMS` documents the core query parameters supported by
 *   the weather.gov `/alerts` endpoints and their allowed/typical values.
 * - `USED_FILTERS` defines the subset of those parameters/values that
 *   this project currently uses, both in API queries and client-side filters.
 * - `DAMAGE_EVENT_CONFIG` lists which NWS event types we consider strongly
 *   associated with property damage; this is opinionated business logic
 *   built on top of the NWS schema (which does not label events as
 *   "damage-causing" directly).
 *
 * This file exists so you do NOT need to open the OpenAPI spec to see
 * what's possible. To change what alerts we care about, update USED_FILTERS
 * and DAMAGE_EVENT_CONFIG.
 *
 * NWS docs: https://www.weather.gov/documentation/services-web-api
 * OpenAPI: https://api.weather.gov/openapi.json
 */

/**
 * AVAILABLE_PARAMS lists key NWS alert query parameters and their values.
 * This is descriptive metadata only; scripts should use USED_FILTERS for logic.
 */
export const AVAILABLE_PARAMS = {
  status: {
    description: 'Operational status of the alert',
    values: ['actual', 'exercise', 'system', 'test', 'draft'],
  },
  severity: {
    description: 'Severity of the event',
    values: ['extreme', 'severe', 'moderate', 'minor', 'unknown'],
  },
  certainty: {
    description: 'Certainty that the event will occur or is occurring',
    values: ['observed', 'likely', 'possible', 'unlikely', 'unknown'],
  },
  urgency: {
    description: 'How soon the event is expected to begin',
    values: ['immediate', 'expected', 'future', 'past', 'unknown'],
  },
  message_type: {
    description: 'Type of CAP message',
    values: ['alert', 'update', 'cancel'],
  },
  area: {
    description: 'State/area code (e.g. CA, KS)',
    values: 'Any 2-letter state/area code',
  },
  event: {
    description: 'Event name, e.g. Tornado Warning or Flood Warning',
    values: 'Any string from alert-types.json eventTypes[]',
  },
  zone: {
    description: 'NWS public zone or county UGC code',
    values: 'Zone IDs like CAZ041, KSZ008, etc.',
  },
  region: {
    description: 'Marine region code',
    values: 'See NWS marine region codes in the API docs',
  },
  region_type: {
    description: 'Region type filter',
    values: ['land', 'marine'],
  },
  point: {
    description: 'Latitude,Longitude point (incompatible with area/zone/region)',
    values: 'String: "<lat>,<lon>" e.g. "39.7456,-97.0892"',
  },
  limit: {
    description: 'Maximum number of records returned',
    values: 'Integer between 1 and 500 (default 500)',
  },
  cursor: {
    description: 'Pagination cursor for fetching additional pages',
    values: 'Opaque string returned by the API',
  },
};

/**
 * USED_FILTERS is the project-wide configuration for which alerts matter
 * for our workflows. Scripts should import and use this instead of
 * hard-coding severity/certainty/status strings.
 */
export const USED_FILTERS = {
  api: {
    /**
     * Query parameters sent directly to the weather.gov API.
     *
     * Notes:
     * - We currently only request `status=actual` to avoid tests/system messages.
     * - `area` is supplied dynamically from process.env.AREA when present,
     *   so it is not hard-coded here.
     */
    status: ['actual'],
  },
  client: {
    /**
     * Additional filters applied in code to the returned alerts.
     *
     * These values are compared against `feature.properties.severity`
     * and `feature.properties.certainty` (case-insensitive).
     */
    severity: ['extreme', 'severe'],
    certainty: ['observed', 'likely'],
  },
};

/**
 * DAMAGE_EVENT_CONFIG defines which NWS event types we consider property-damage-relevant.
 *
 * How this is used:
 * - `primaryUsed` lists NWS event names (from alert-types.json) that are strongly
 *   associated with potential physical damage to real property. These events are
 *   used in filtering logic to identify "damage-capable" alerts.
 * - `primaryPossible` lists additional NWS events that *could* be relevant but are
 *   not currently in use. Move items from `primaryPossible` to `primaryUsed` to
 *   expand coverage without changing code elsewhere.
 *
 * Hazard families covered in primaryUsed:
 * - Wind / Convective: severe thunderstorm, tornado, high winds, hurricanes, storms
 * - Flooding / Water: flash flood, riverine flood, coastal flood, storm surge, tsunami
 * - Winter / Ice: blizzard, winter storm, ice storm, lake-effect snow
 * - Fire / Wildfire: fire warning, red flag, extreme fire danger
 * - Marine / Coastal: gale, hazardous seas, high surf, freezing spray
 * - Cold / Freeze: freeze warning, extreme cold (pipe-burst risk)
 * - Geophysical: earthquake, volcano, ashfall, dust storm
 *
 * Note: This is opinionated business logic; the NWS API does NOT label events as
 * "damage-causing" directly. All event strings must match values in alert-types.json.
 */
export const DAMAGE_EVENT_CONFIG = {
  /**
   * NWS event types currently used for property-damage filtering.
   */
  primaryUsed: [
    // Wind / Convective
    'Severe Thunderstorm Warning',
    'Tornado Warning',
    'Snow Squall Warning',
    'Extreme Wind Warning',
    'High Wind Warning',
    'Hurricane Force Wind Warning',
    'Storm Warning',
    
    // Tropical Cyclones
    'Hurricane Warning',
    'Typhoon Warning',
    'Tropical Storm Warning',
    
    // Flooding / Water
    'Flash Flood Warning',
    'Flood Warning',
    'Coastal Flood Warning',
    'Lakeshore Flood Warning',
    'Storm Surge Warning',
    'Tsunami Warning',
    
    // Winter / Ice
    'Blizzard Warning',
    'Winter Storm Warning',
    'Lake Effect Snow Warning',
    'Ice Storm Warning',
    
    // Fire / Wildfire
    'Fire Warning',
    'Red Flag Warning',
    'Extreme Fire Danger',
    
    // Marine / Coastal
    'Hazardous Seas Warning',
    'Heavy Freezing Spray Warning',
    'Gale Warning',
    'High Surf Warning',
    'Special Marine Warning',
    
    // Cold / Freeze
    'Freeze Warning',
    'Extreme Cold Warning',
    
    // Geophysical / Other
    'Earthquake Warning',
    'Volcano Warning',
    'Ashfall Warning',
    'Dust Storm Warning',
    'Blowing Dust Warning',
  ],

  /**
   * NWS event types that are reasonable future candidates for property-damage
   * filtering but not currently used. Move to `primaryUsed` to enable them.
   */
  primaryPossible: [
    // Watches (early warning, not guaranteed damage)
    'Hurricane Force Wind Watch',
    'High Wind Watch',
    'Tornado Watch',
    'Severe Thunderstorm Watch',
    'Flood Watch',
    'Flash Flood Watch',
    'Coastal Flood Watch',
    'Lakeshore Flood Watch',
    'Storm Surge Watch',
    'Winter Storm Watch',
    'Hurricane Watch',
    'Typhoon Watch',
    'Tropical Storm Watch',
    'Gale Watch',
    'Heavy Freezing Spray Watch',
    
    // Advisories (lower severity, but sometimes relevant)
    'Wind Advisory',
    'Winter Weather Advisory',
    'Coastal Flood Advisory',
    'Lakeshore Flood Advisory',
    'Flood Advisory',
    'High Surf Advisory',
    
    // Freeze-related
    'Freeze Watch',
    'Extreme Cold Watch',
    
    // Other geophysical
    'Tsunami Watch',
    'Tsunami Advisory',
    'Avalanche Warning',
    'Avalanche Watch',
    'Ashfall Advisory',
  ],
};


