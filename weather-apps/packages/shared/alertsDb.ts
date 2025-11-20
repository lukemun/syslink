/**
 * Shared database access for weather alerts
 * 
 * Purpose:
 * - Provides reusable functions for querying weather alerts and enriched zip code data
 * - Can be used by both Next.js frontend and Node.js ingestion scripts
 * - Supports both Supabase client (for Next.js) and direct Postgres pool (for scripts)
 * 
 * Usage (Next.js):
 *   import { getActiveAlertsForUI } from '@/../../shared/alertsDb';
 *   const alerts = await getActiveAlertsForUI(supabaseClient);
 * 
 * Usage (Node.js scripts):
 *   import { getActiveAlertsForUI } from './shared/alertsDb.js';
 *   const alerts = await getActiveAlertsForUI(pgPool);
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type pg from 'pg';

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
 * Zip code mapping row
 */
interface ZipCodeRow {
  alert_id: string;
  zipcode: string;
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
  } = {}
): Promise<EnrichedAlert[]> {
  const { status = 'Actual', is_damaged, limit = 100 } = options;

  // Check if this is a Supabase client or pg.Pool
  const isSupabase = 'from' in client;

  let alerts: AlertRow[];
  let allZipMappings: ZipCodeRow[];

  if (isSupabase) {
    // Supabase query
    let query = (client as SupabaseClient)
      .from('weather_alerts')
      .select('*')
      .eq('status', status)
      .order('onset', { ascending: true, nullsFirst: false })
      .order('effective', { ascending: true })
      .limit(limit);

    if (is_damaged !== undefined) {
      query = query.eq('is_damaged', is_damaged);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    alerts = data || [];

    // Get all zip codes for these alerts
    const alertIds = alerts.map((a) => a.id);
    if (alertIds.length > 0) {
      const { data: zipData, error: zipError } = await (client as SupabaseClient)
        .from('weather_alert_zipcodes')
        .select('alert_id, zipcode')
        .in('alert_id', alertIds);
      
      if (zipError) throw new Error(`Supabase zip query failed: ${zipError.message}`);
      allZipMappings = zipData || [];
    } else {
      allZipMappings = [];
    }
  } else {
    // pg.Pool query
    const pgClient = client as pg.Pool;
    
    let whereClause = 'WHERE status = $1';
    const params: any[] = [status];
    
    if (is_damaged !== undefined) {
      whereClause += ' AND is_damaged = $2';
      params.push(is_damaged);
    }

    const alertQuery = `
      SELECT 
        id, event, status, severity, certainty, urgency, 
        area_desc, nws_office, sent, effective, onset, expires, 
        is_damaged, created_at, updated_at
      FROM weather_alerts
      ${whereClause}
      ORDER BY 
        CASE WHEN onset IS NULL THEN 1 ELSE 0 END,
        onset ASC,
        effective ASC
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    const alertResult = await pgClient.query(alertQuery, params);
    alerts = alertResult.rows;

    // Get all zip codes for these alerts
    const alertIds = alerts.map((a) => a.id);
    if (alertIds.length > 0) {
      const zipQuery = `
        SELECT alert_id, zipcode
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

  // Group zip codes by alert_id
  const zipsByAlert = new Map<string, string[]>();
  for (const row of allZipMappings) {
    if (!zipsByAlert.has(row.alert_id)) {
      zipsByAlert.set(row.alert_id, []);
    }
    zipsByAlert.get(row.alert_id)!.push(row.zipcode);
  }

  // Enrich alerts with zip codes and computed fields
  return alerts.map((alert): EnrichedAlert => {
    const zipCodes = zipsByAlert.get(alert.id) || [];
    const { level, color } = getSeverityInfo(alert.severity, alert.urgency);

    return {
      ...alert,
      sent: alert.sent,
      effective: alert.effective,
      onset: alert.onset,
      expires: alert.expires,
      created_at: alert.created_at,
      updated_at: alert.updated_at,
      zipCodes,
      zipSummary: createZipSummary(zipCodes),
      severityLevel: level,
      severityColor: color,
      disasterType: getDisasterType(alert.event),
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
  } = {}
): Promise<EnrichedAlert[]> {
  const { status = 'Actual', is_damaged, limit = 100, includeMarine = true } = options;

  // First get all non-superseded (current) alerts
  const currentAlerts = await getActiveAlertsForUI(client, {
    status,
    is_damaged,
    limit,
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
        .select('*')
        .eq('superseded_by', alert.id)
        .order('effective', { ascending: true });

      if (!error && data) {
        supersededAlerts = data;
      }
    } else {
      const query = `
        SELECT * FROM weather_alerts
        WHERE superseded_by = $1
        ORDER BY effective ASC
      `;
      const result = await (client as pg.Pool).query(query, [alert.id]);
      supersededAlerts = result.rows;
    }

    // Enrich the superseded alerts
    const updates: EnrichedAlert[] = [];
    for (const oldAlert of supersededAlerts) {
      // Get zip codes for this old alert
      let zipCodes: string[] = [];
      if (isSupabase) {
        const { data: zipData } = await (client as SupabaseClient)
          .from('weather_alert_zipcodes')
          .select('zipcode')
          .eq('alert_id', oldAlert.id);
        zipCodes = zipData?.map(z => z.zipcode) || [];
      } else {
        const zipQuery = 'SELECT zipcode FROM weather_alert_zipcodes WHERE alert_id = $1';
        const zipResult = await (client as pg.Pool).query(zipQuery, [oldAlert.id]);
        zipCodes = zipResult.rows.map(r => r.zipcode);
      }

      const { level, color } = getSeverityInfo(oldAlert.severity, oldAlert.urgency);
      updates.push({
        ...oldAlert,
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

