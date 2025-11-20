/**
 * NWS Alert parameter catalog and project-wide filter configuration.
 *
 * Usage & purpose:
 * - AVAILABLE_PARAMS documents the core query parameters supported by the weather.gov /alerts endpoints
 * - USED_FILTERS defines the subset of parameters used in API queries and client-side filters
 * - DAMAGE_EVENT_CONFIG lists NWS event types associated with property damage
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

export const USED_FILTERS = {
  api: {
    status: ['actual'],
  },
  client: {
    severity: ['extreme', 'severe'],
    certainty: ['observed', 'likely'],
  },
};

export const DAMAGE_EVENT_CONFIG = {
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

