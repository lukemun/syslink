/**
 * Shared database access for weather alerts
 * 
 * Purpose:
 * - Provides reusable functions for querying weather alerts and enriched zip code data
 * - Can be used by both Next.js frontend and Node.js ingestion scripts
 * - Supports both Supabase client (for Next.js) and direct Postgres pool (for scripts)
 * 
 * Usage (Next.js):
 *   import { getActiveAlertsForUI } from '@/shared/alertsDb';
 *   const alerts = await getActiveAlertsForUI(supabaseClient);
 * 
 * Usage (Node.js scripts):
 *   import { getActiveAlertsForUI } from './shared/alertsDb.js';
 *   const alerts = await getActiveAlertsForUI(pgPool);
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type pg from 'pg';

/**
 * Weather damage trigger keywords for matching
 * Subset of most common/important keywords from weather_damage_triggers_extended.csv
 */
const DAMAGE_KEYWORDS = [
  'tornado',
  'damaging winds',
  'destructive',
  'severe thunderstorm',
  'flash flood',
  'flooding',
  'hail',
  'hurricane',
  'tropical storm',
  'winter storm',
  'blizzard',
  'ice storm',
  'wildfire',
  'fire weather',
  'debris flow',
  'landslide',
  'tsunami',
  'storm surge',
  'coastal flood',
  'wind damage',
  'structural damage',
  'property damage',
  'trees down',
  'power outages',
  'life threatening',
];

/**
 * Enriched alert data structure for UI display
 */
export interface EnrichedAlert {
  id: string;
  event: string;
  status: string;
  severity: string | null;
  certainty: string | null;
  urgency: string | null;
  area_desc: string | null;
  nws_office: string | null;
  description: string | null;
  headline: string | null;
  instruction: string | null;
  sent: string;
  effective: string;
  onset: string | null;
  expires: string | null;
  is_damaged: boolean;
  message_type: string | null;
  is_superseded: boolean;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
  // Enriched fields
  zipCodes: string[];
  zipSummary: string;
  severityLevel: 'extreme' | 'severe' | 'moderate' | 'minor' | 'unknown';
  severityColor: string;
  disasterType: string;
  // Categorized ZIP codes by provenance
  candidateZips: string[];   // All ZIPs from county (baseline)
  cityZips: string[];        // ZIPs from city name matching
  polygonZips: string[];     // ZIPs filtered by geometry boundary
  overlappingZips: string[]; // ZIPs that match both polygon AND city
  // Damage keywords matched in alert text
  damageKeywords: string[];
  // Update history (for superseded alerts)
  updates?: EnrichedAlert[];
}

/**
 * Raw alert row from database
 */
interface AlertRow {
  id: string;
  event: string;
  status: string;
  severity: string | null;
  certainty: string | null;
  urgency: string | null;
  area_desc: string | null;
  nws_office: string | null;
  description: string | null;
  headline: string | null;
  instruction: string | null;
  sent: string;
  effective: string;
  onset: string | null;
  expires: string | null;
  is_damaged: boolean;
  message_type: string | null;
  is_superseded: boolean;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Zip code mapping row with provenance flags
 */
interface ZipCodeRow {
  alert_id: string;
  zipcode: string;
  from_county: boolean;
  from_polygon: boolean;
  from_city: boolean;
}

/**
 * Determine severity level and color from alert properties
 */
function getSeverityInfo(severity: string | null, urgency: string | null): {
  level: EnrichedAlert['severityLevel'];
  color: string;
} {
  const sev = severity?.toLowerCase();
  const urg = urgency?.toLowerCase();

  if (sev === 'extreme') {
    return { level: 'extreme', color: 'bg-red-600 text-white' };
  }
  if (sev === 'severe') {
    return { level: 'severe', color: 'bg-orange-500 text-white' };
  }
  if (sev === 'moderate' || urg === 'expected') {
    return { level: 'moderate', color: 'bg-yellow-500 text-black' };
  }
  if (sev === 'minor') {
    return { level: 'minor', color: 'bg-gray-400 text-white' };
  }
  return { level: 'unknown', color: 'bg-gray-300 text-gray-700' };
}

/**
 * Map event name to human-friendly disaster type
 */
function getDisasterType(event: string): string {
  const eventLower = event.toLowerCase();
  
  // Map common NWS event types to simplified categories
  if (eventLower.includes('flood')) return 'Flood';
  if (eventLower.includes('fire') || eventLower.includes('smoke')) return 'Wildfire';
  if (eventLower.includes('tornado')) return 'Tornado';
  if (eventLower.includes('hurricane') || eventLower.includes('tropical')) return 'Hurricane';
  if (eventLower.includes('winter') || eventLower.includes('snow') || eventLower.includes('ice')) return 'Winter Storm';
  if (eventLower.includes('wind')) return 'Wind';
  if (eventLower.includes('heat')) return 'Heat';
  if (eventLower.includes('cold') || eventLower.includes('freeze')) return 'Cold';
  if (eventLower.includes('earthquake')) return 'Earthquake';
  if (eventLower.includes('tsunami')) return 'Tsunami';
  if (eventLower.includes('storm')) return 'Severe Storm';
  
  // Return original if no match
  return event;
}

/**
 * Create a summary string for zip codes
 */
function createZipSummary(zipCodes: string[]): string {
  if (zipCodes.length === 0) return 'No zip codes';
  if (zipCodes.length <= 3) return zipCodes.join(', ');
  
  const first3 = zipCodes.slice(0, 3).join(', ');
  const remaining = zipCodes.length - 3;
  return `${first3} (+${remaining} more)`;
}

/**
 * Categorize ZIP codes based on their provenance flags
 * 
 * For legacy data where all flags are false, we treat all ZIPs as candidate ZIPs
 * 
 * Returns 4 categories:
 * - candidateZips: All ZIPs from county/FIPS (baseline)
 * - cityZips: ZIPs matched by city name extraction
 * - polygonZips: ZIPs matched by geometry boundary
 * - overlappingZips: ZIPs that match BOTH polygon AND city (highest confidence)
 */
function categorizeZips(zipRows: ZipCodeRow[]): {
  candidateZips: string[];
  cityZips: string[];
  polygonZips: string[];
  overlappingZips: string[];
} {
  const candidateSet = new Set<string>();
  const citySet = new Set<string>();
  const polygonSet = new Set<string>();
  const overlappingSet = new Set<string>();

  // Check if we have any ZIPs with provenance flags set
  const hasProvenanceData = zipRows.some(
    row => row.from_county || row.from_polygon || row.from_city
  );

  console.log('[categorizeZips] Processing', zipRows.length, 'ZIP rows, hasProvenanceData:', hasProvenanceData);
  if (zipRows.length > 0) {
    console.log('[categorizeZips] Sample ZIP row:', zipRows[0]);
  }

  for (const row of zipRows) {
    // If no provenance data exists, treat all ZIPs as candidates (legacy data)
    if (!hasProvenanceData) {
      candidateSet.add(row.zipcode);
    } else {
      // New data with provenance flags
      if (row.from_county) {
        candidateSet.add(row.zipcode);
      }
      if (row.from_city) {
        citySet.add(row.zipcode);
      }
      if (row.from_polygon) {
        polygonSet.add(row.zipcode);
      }
      if (row.from_polygon && row.from_city) {
        overlappingSet.add(row.zipcode);
      }
    }
  }

  const result = {
    candidateZips: Array.from(candidateSet).sort(),
    cityZips: Array.from(citySet).sort(),
    polygonZips: Array.from(polygonSet).sort(),
    overlappingZips: Array.from(overlappingSet).sort(),
  };
  
  console.log('[categorizeZips] Result:', {
    candidates: result.candidateZips.length,
    city: result.cityZips.length,
    polygon: result.polygonZips.length,
    overlapping: result.overlappingZips.length
  });

  return result;
}

/**
 * Extract damage keywords from alert text
 */
function extractDamageKeywords(
  description: string | null,
  headline: string | null,
  instruction: string | null
): string[] {
  const textToSearch = [
    headline || '',
    description || '',
    instruction || '',
  ]
    .join(' ')
    .toLowerCase();

  const matched = new Set<string>();
  for (const keyword of DAMAGE_KEYWORDS) {
    if (textToSearch.includes(keyword.toLowerCase())) {
      matched.add(keyword);
    }
  }

  return Array.from(matched).sort();
}

/**
 * Get active alerts with zip code enrichment for UI display
 * Supports both Supabase client (Next.js) and pg.Pool (Node.js scripts)
 * 
 * @param client - Either a Supabase client or a pg.Pool instance
 * @param options - Optional filters (status, is_damaged, limit)
 * @returns Array of enriched alert objects
 */
export async function getActiveAlertsForUI(
  client: SupabaseClient | pg.Pool,
  options: {
    status?: string;
    is_damaged?: boolean;
    limit?: number;
    excludeExpired?: boolean;
    since?: Date; // Filter alerts sent on or after this date
  } = {}
): Promise<EnrichedAlert[]> {
  const { status = 'Actual', is_damaged, limit = 100, excludeExpired = true, since } = options;

  // Check if this is a Supabase client or pg.Pool
  const isSupabase = 'from' in client;

  let alerts: AlertRow[];
  let allZipMappings: ZipCodeRow[];

  if (isSupabase) {
    // Supabase query - select all columns plus description, headline, instruction from raw JSON
    let query = (client as SupabaseClient)
      .from('weather_alerts')
      .select('*, description:raw->properties->>description, headline:raw->properties->>headline, instruction:raw->properties->>instruction')
      .eq('status', status)
      .order('sent', { ascending: false })
      .limit(limit);

    if (is_damaged !== undefined) {
      query = query.eq('is_damaged', is_damaged);
    }
    
    if (since) {
      query = query.gte('sent', since.toISOString());
    }
    
    if (excludeExpired) {
      query = query.or('expires.is.null,expires.gt.' + new Date().toISOString());
    }

    const { data, error } = await query;
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    
    // Log first alert to verify description extraction
    if (data && data.length > 0) {
      console.log('[alertsDb] First alert description check:', {
        id: data[0].id?.substring(0, 40),
        event: data[0].event,
        hasDescription: !!data[0].description,
        descriptionLength: data[0].description?.length || 0,
        descriptionPreview: data[0].description?.substring(0, 100)
      });
    }
    
    alerts = data || [];

    // Get all zip codes for these alerts with provenance flags
    const alertIds = alerts.map((a) => a.id);
    if (alertIds.length > 0) {
      const { data: zipData, error: zipError } = await (client as SupabaseClient)
        .from('weather_alert_zipcodes')
        .select('alert_id, zipcode, from_county, from_polygon, from_city')
        .in('alert_id', alertIds);
      
      if (zipError) throw new Error(`Supabase zip query failed: ${zipError.message}`);
      allZipMappings = zipData || [];
    } else {
      allZipMappings = [];
    }
  } else {
    // pg.Pool query - extract description, headline, instruction from raw JSONB column
    const pgClient = client as pg.Pool;
    
    let whereClause = 'WHERE status = $1';
    const params: any[] = [status];
    
    if (is_damaged !== undefined) {
      whereClause += ` AND is_damaged = $${params.length + 1}`;
      params.push(is_damaged);
    }
    
    if (since) {
      whereClause += ` AND sent >= $${params.length + 1}`;
      params.push(since.toISOString());
    }
    
    if (excludeExpired) {
      whereClause += ` AND (expires IS NULL OR expires > NOW())`;
    }

    const alertQuery = `
      SELECT 
        id, event, status, severity, certainty, urgency, 
        area_desc, nws_office, 
        raw->'properties'->>'description' as description,
        raw->'properties'->>'headline' as headline,
        raw->'properties'->>'instruction' as instruction,
        sent, effective, onset, expires, 
        is_damaged, message_type, is_superseded, superseded_by, 
        created_at, updated_at
      FROM weather_alerts
      ${whereClause}
      ORDER BY sent DESC
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    const alertResult = await pgClient.query(alertQuery, params);
    
    // Log first alert to verify description extraction
    if (alertResult.rows.length > 0) {
      console.log('[alertsDb] First alert description check:', {
        id: alertResult.rows[0].id?.substring(0, 40),
        event: alertResult.rows[0].event,
        hasDescription: !!alertResult.rows[0].description,
        descriptionLength: alertResult.rows[0].description?.length || 0,
        descriptionPreview: alertResult.rows[0].description?.substring(0, 100)
      });
    }
    
    alerts = alertResult.rows;

    // Get all zip codes for these alerts with provenance flags
    const alertIds = alerts.map((a) => a.id);
    if (alertIds.length > 0) {
      const zipQuery = `
        SELECT alert_id, zipcode, from_county, from_polygon, from_city
        FROM weather_alert_zipcodes
        WHERE alert_id = ANY($1)
        ORDER BY alert_id, zipcode
      `;
      const zipResult = await pgClient.query(zipQuery, [alertIds]);
      allZipMappings = zipResult.rows;
    } else {
      allZipMappings = [];
    }
  }

  // Group zip codes by alert_id with their provenance flags
  const zipsByAlert = new Map<string, string[]>();
  const zipRowsByAlert = new Map<string, ZipCodeRow[]>();
  
  console.log('[alertsDb] Total ZIP mappings fetched:', allZipMappings.length);
  if (allZipMappings.length > 0) {
    console.log('[alertsDb] Sample ZIP mapping:', allZipMappings[0]);
  }
  
  for (const row of allZipMappings) {
    if (!zipsByAlert.has(row.alert_id)) {
      zipsByAlert.set(row.alert_id, []);
      zipRowsByAlert.set(row.alert_id, []);
    }
    zipsByAlert.get(row.alert_id)!.push(row.zipcode);
    zipRowsByAlert.get(row.alert_id)!.push(row);
  }
  
  console.log('[alertsDb] Alerts with ZIPs:', zipsByAlert.size);

  // Enrich alerts with zip codes and computed fields
  return alerts.map((alert): EnrichedAlert => {
    const zipCodes = zipsByAlert.get(alert.id) || [];
    const zipRows = zipRowsByAlert.get(alert.id) || [];
    const { level, color } = getSeverityInfo(alert.severity, alert.urgency);
    const { candidateZips, cityZips, polygonZips, overlappingZips } = categorizeZips(zipRows);
    const damageKeywords = extractDamageKeywords(
      alert.description,
      alert.headline,
      alert.instruction
    );

    console.log('[alertsDb] Enriched alert:', {
      id: alert.id.substring(0, 50),
      zipCodes: zipCodes.length,
      candidateZips: candidateZips.length,
      cityZips: cityZips.length,
      polygonZips: polygonZips.length,
      overlappingZips: overlappingZips.length,
    });

    // Use refined ZIPs (polygonZips) as primary display if available, else fall back to all ZIPs
    const displayZips = polygonZips.length > 0 ? polygonZips : zipCodes;
    
    console.log('[alertsDb] Using display ZIPs:', {
      id: alert.id.substring(0, 50),
      rawZipCount: zipCodes.length,
      polygonZipCount: polygonZips.length,
      displayZipCount: displayZips.length,
      displayZipsSample: displayZips.slice(0, 5),
    });
    
    return {
      ...alert,
      description: alert.description,
      headline: alert.headline,
      instruction: alert.instruction,
      sent: alert.sent,
      effective: alert.effective,
      onset: alert.onset,
      expires: alert.expires,
      created_at: alert.created_at,
      updated_at: alert.updated_at,
      zipCodes: displayZips,
      zipSummary: createZipSummary(displayZips),
      severityLevel: level,
      severityColor: color,
      disasterType: getDisasterType(alert.event),
      candidateZips,
      cityZips,
      polygonZips,
      overlappingZips,
      damageKeywords,
    };
  });
}

/**
 * Get active alerts with update history (superseded versions)
 * Only returns non-superseded alerts, with their update history attached
 * 
 * @param client - Either a Supabase client or a pg.Pool instance
 * @param options - Optional filters
 * @returns Array of enriched alert objects with updates array
 */
export async function getActiveAlertsWithHistory(
  client: SupabaseClient | pg.Pool,
  options: {
    status?: string;
    is_damaged?: boolean;
    limit?: number;
    includeMarine?: boolean; // If false, filters out alerts with no zip codes
    since?: Date; // Filter alerts sent on or after this date
    excludeExpired?: boolean; // If false, includes expired alerts (useful for historical damage views)
  } = {}
): Promise<EnrichedAlert[]> {
  const { status = 'Actual', is_damaged, limit = 100, includeMarine = true, since, excludeExpired = true } = options;

  // First get all non-superseded (current) alerts
  const currentAlerts = await getActiveAlertsForUI(client, {
    status,
    is_damaged,
    limit,
    since,
    excludeExpired,
  });

  // Filter out marine alerts if requested
  const filteredAlerts = includeMarine 
    ? currentAlerts 
    : currentAlerts.filter(alert => alert.zipCodes.length > 0);

  // Filter to only non-superseded alerts
  const activeAlerts = filteredAlerts.filter(alert => !alert.is_superseded);

  // For each active alert, find if it has superseded any previous versions
  const isSupabase = 'from' in client;
  const alertsWithHistory: EnrichedAlert[] = [];

  for (const alert of activeAlerts) {
    // Find all alerts that are superseded by this one
    let supersededAlerts: AlertRow[] = [];

    if (isSupabase) {
      const { data, error } = await (client as SupabaseClient)
        .from('weather_alerts')
        .select('*, description:raw->properties->>description, headline:raw->properties->>headline, instruction:raw->properties->>instruction')
        .eq('superseded_by', alert.id)
        .order('effective', { ascending: true });

      if (!error && data) {
        supersededAlerts = data;
      }
    } else {
      const query = `
        SELECT 
          id, event, status, severity, certainty, urgency, 
          area_desc, nws_office, 
          raw->'properties'->>'description' as description,
          raw->'properties'->>'headline' as headline,
          raw->'properties'->>'instruction' as instruction,
          sent, effective, onset, expires, 
          is_damaged, message_type, is_superseded, superseded_by, 
          created_at, updated_at
        FROM weather_alerts
        WHERE superseded_by = $1
        ORDER BY effective ASC
      `;
      const result = await (client as pg.Pool).query(query, [alert.id]);
      supersededAlerts = result.rows;
    }

    // Enrich the superseded alerts
    const updates: EnrichedAlert[] = [];
    for (const oldAlert of supersededAlerts) {
      // Get zip codes for this old alert with provenance flags
      let zipCodes: string[] = [];
      let zipRows: ZipCodeRow[] = [];
      
      if (isSupabase) {
        const { data: zipData } = await (client as SupabaseClient)
          .from('weather_alert_zipcodes')
          .select('zipcode, from_county, from_polygon, from_city')
          .eq('alert_id', oldAlert.id);
        zipRows = zipData?.map(z => ({
          alert_id: oldAlert.id,
          zipcode: z.zipcode,
          from_county: z.from_county || false,
          from_polygon: z.from_polygon || false,
          from_city: z.from_city || false,
        })) || [];
        zipCodes = zipRows.map(z => z.zipcode);
      } else {
        const zipQuery = 'SELECT zipcode, from_county, from_polygon, from_city FROM weather_alert_zipcodes WHERE alert_id = $1';
        const zipResult = await (client as pg.Pool).query(zipQuery, [oldAlert.id]);
        zipRows = zipResult.rows.map(r => ({
          alert_id: oldAlert.id,
          zipcode: r.zipcode,
          from_county: r.from_county || false,
          from_polygon: r.from_polygon || false,
          from_city: r.from_city || false,
        }));
        zipCodes = zipRows.map(r => r.zipcode);
      }

      const { level, color } = getSeverityInfo(oldAlert.severity, oldAlert.urgency);
      const { candidateZips, cityZips, polygonZips, overlappingZips } = categorizeZips(zipRows);
      const damageKeywords = extractDamageKeywords(
        oldAlert.description,
        oldAlert.headline,
        oldAlert.instruction
      );

      updates.push({
        ...oldAlert,
        description: oldAlert.description,
        headline: oldAlert.headline,
        instruction: oldAlert.instruction,
        sent: oldAlert.sent,
        effective: oldAlert.effective,
        onset: oldAlert.onset,
        expires: oldAlert.expires,
        created_at: oldAlert.created_at,
        updated_at: oldAlert.updated_at,
        zipCodes,
        zipSummary: createZipSummary(zipCodes),
        severityLevel: level,
        severityColor: color,
        disasterType: getDisasterType(oldAlert.event),
        candidateZips,
        cityZips,
        polygonZips,
        overlappingZips,
        damageKeywords,
      });
    }

    // Add the alert with its updates
    alertsWithHistory.push({
      ...alert,
      updates: updates.length > 0 ? updates : undefined,
    });
  }

  return alertsWithHistory;
}

/**
 * Get a count of active alerts by severity level
 * 
 * @param client - Either a Supabase client or a pg.Pool instance
 * @returns Object with counts by severity
 */
export async function getAlertCountsBySeverity(
  client: SupabaseClient | pg.Pool
): Promise<Record<string, number>> {
  const isSupabase = 'from' in client;

  if (isSupabase) {
    const { data, error} = await (client as SupabaseClient)
      .from('weather_alerts')
      .select('severity')
      .eq('status', 'Actual');

    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    
    const counts: Record<string, number> = {};
    for (const row of data || []) {
      const severity = row.severity || 'unknown';
      counts[severity] = (counts[severity] || 0) + 1;
    }
    return counts;
  } else {
    const query = `
      SELECT severity, COUNT(*) as count
      FROM weather_alerts
      WHERE status = 'Actual'
      GROUP BY severity
    `;
    const result = await (client as pg.Pool).query(query);
    
    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      counts[row.severity || 'unknown'] = parseInt(row.count, 10);
    }
    return counts;
  }
}

