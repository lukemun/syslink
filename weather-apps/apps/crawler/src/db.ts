/**
 * Database utilities for managing weather_alerts and weather_alert_zipcodes tables in Postgres/Supabase.
 *
 * Purpose:
 * - Provides typed AlertRow interface matching the weather_alerts schema.
 * - Manages Postgres connection pool using environment variables.
 * - Exposes upsertAlerts helper for batch upserting alert records.
 * - Provides upsertAlertZipcodes for batch upserting zipcode-to-alert mappings.
 * - Provides getZipcodesForAlert and getAlertsForZipcode for querying relationships.
 *
 * Usage:
 *   import { upsertAlerts, upsertAlertZipcodes, AlertRow } from './db.js';
 *   
 *   const rows: AlertRow[] = [...];
 *   await upsertAlerts(rows);
 *   
 *   await upsertAlertZipcodes('alert-123', ['90001', '90002']);
 *   const zips = await getZipcodesForAlert('alert-123');
 *
 * Environment:
 *   Requires DATABASE_URL in environment variables.
 */

import pg from 'pg';

const { Pool } = pg;

/**
 * AlertRow interface matching the weather_alerts table schema.
 */
export interface AlertRow {
  id: string;
  event: string;
  status: string;
  severity: string | null;
  certainty: string | null;
  urgency: string | null;
  area_desc: string | null;
  nws_office: string | null;
  sent: Date;
  effective: Date;
  onset: Date | null;
  expires: Date | null;
  is_damaged: boolean;
  raw: unknown; // JSONB field
}

// Singleton connection pool
let pool: pg.Pool | null = null;

/**
 * Get or create the Postgres connection pool.
 * Configured for serverless environments with minimal connections and proper timeouts.
 * 
 * For best results with Supabase, use the connection pooler URL:
 * - Port 6543 = Transaction mode (requires ?pgbouncer=true)
 * - Port 5432 on pooler = Session mode
 */
export function getPool(): pg.Pool {
  if (!pool) {
    // Prefer pooler URL for serverless, fall back to direct connection
    let connectionString = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL or DATABASE_POOLER_URL environment variable is required for database connection'
      );
    }

    // Log which connection we're using (helpful for debugging)
    const isPooler = connectionString.includes('pooler.supabase.com');
    console.log(`Using ${isPooler ? 'POOLER' : 'DIRECT'} connection`);
    
    // If using port 6543 (Transaction mode), ensure pgbouncer=true parameter is set
    if (connectionString.includes(':6543/')) {
      const url = new URL(connectionString.replace('postgresql://', 'http://'));
      if (!url.searchParams.has('pgbouncer')) {
        connectionString += (connectionString.includes('?') ? '&' : '?') + 'pgbouncer=true';
        console.log('Added pgbouncer=true parameter for Transaction mode');
      }
    }

    pool = new Pool({
      connectionString,
      // Serverless-optimized settings
      max: 1, // Use only 1 connection per Lambda instance
      idleTimeoutMillis: 5000, // Close idle connections after 5 seconds
      connectionTimeoutMillis: 20000, // Increased to 20 seconds for pooler connection
      // Query timeouts
      statement_timeout: 30000, // 30 second query timeout
      query_timeout: 30000, // 30 second query timeout
      // Allow graceful closure
      allowExitOnIdle: true,
      // SSL configuration - required for Supabase connections
      ssl: {
        rejectUnauthorized: false, // Accept self-signed certs in Lambda environment
      },
    });
  }
  return pool;
}

/**
 * Execute a function with a database client from the pool.
 * Automatically acquires and releases the client.
 */
export async function withClient<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Upsert a batch of alert rows into the weather_alerts table.
 * Uses INSERT ... ON CONFLICT (id) DO UPDATE to handle both inserts and updates.
 */
export async function upsertAlerts(alerts: AlertRow[]): Promise<void> {
  if (alerts.length === 0) {
    return;
  }

  console.log(`Upserting ${alerts.length} alerts to database...`);
  const startTime = Date.now();

  await withClient(async (client) => {
    // Set statement timeout for this connection
    await client.query('SET statement_timeout = 30000'); // 30 seconds
    
    const columns = [
      'id',
      'event',
      'status',
      'severity',
      'certainty',
      'urgency',
      'area_desc',
      'nws_office',
      'sent',
      'effective',
      'onset',
      'expires',
      'is_damaged',
      'raw',
    ];

    const values: any[] = [];
    const valueStrings: string[] = [];
    let paramIndex = 1;

    for (const alert of alerts) {
      const placeholders = columns.map(() => `$${paramIndex++}`).join(', ');
      valueStrings.push(`(${placeholders})`);

      values.push(
        alert.id,
        alert.event,
        alert.status,
        alert.severity,
        alert.certainty,
        alert.urgency,
        alert.area_desc,
        alert.nws_office,
        alert.sent,
        alert.effective,
        alert.onset,
        alert.expires,
        alert.is_damaged,
        JSON.stringify(alert.raw)
      );
    }

    const updateSet = columns
      .filter((col) => col !== 'id' && col !== 'created_at')
      .map((col) => `${col} = EXCLUDED.${col}`)
      .join(', ');

    const query = `
      INSERT INTO weather_alerts (${columns.join(', ')})
      VALUES ${valueStrings.join(', ')}
      ON CONFLICT (id) DO UPDATE
      SET ${updateSet}
    `;

    console.log(`Executing upsert query (${values.length} parameters)...`);
    await client.query(query, values);
    
    const duration = Date.now() - startTime;
    console.log(`✓ Upsert completed in ${duration}ms`);
  });
}

/**
 * ZIP with provenance flags indicating which filtering strategy identified it.
 */
export interface ZipcodeWithFlags {
  zipcode: string;
  fromCounty: boolean;
  fromPolygon: boolean;
  fromCity: boolean;
}

/**
 * Upsert zipcode mappings for a single alert into weather_alert_zipcodes table.
 * Accepts ZIPs with provenance flags to track which filtering strategies identified each ZIP.
 * Uses INSERT ... ON CONFLICT to handle idempotent upserts.
 */
export async function upsertAlertZipcodes(
  alertId: string,
  zipcodes: ZipcodeWithFlags[]
): Promise<void> {
  if (zipcodes.length === 0) {
    return;
  }

  await withClient(async (client) => {
    // Set statement timeout for this connection
    await client.query('SET statement_timeout = 30000'); // 30 seconds
    
    const values: any[] = [];
    const valueStrings: string[] = [];
    let paramIndex = 1;

    for (const zip of zipcodes) {
      valueStrings.push(
        `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
      );
      values.push(alertId, zip.zipcode, zip.fromCounty, zip.fromPolygon, zip.fromCity);
    }

    const query = `
      INSERT INTO weather_alert_zipcodes (alert_id, zipcode, from_county, from_polygon, from_city)
      VALUES ${valueStrings.join(', ')}
      ON CONFLICT (alert_id, zipcode) DO UPDATE
      SET 
        from_county = EXCLUDED.from_county,
        from_polygon = EXCLUDED.from_polygon,
        from_city = EXCLUDED.from_city,
        created_at = LEAST(weather_alert_zipcodes.created_at, EXCLUDED.created_at)
    `;

    await client.query(query, values);
  });
}

/**
 * Get all zipcodes associated with a specific alert.
 */
export async function getZipcodesForAlert(alertId: string): Promise<string[]> {
  return await withClient(async (client) => {
    const query = `
      SELECT zipcode
      FROM weather_alert_zipcodes
      WHERE alert_id = $1
      ORDER BY zipcode
    `;
    const result = await client.query(query, [alertId]);
    return result.rows.map((row) => row.zipcode);
  });
}

/**
 * Get all alert IDs that affect a specific zipcode.
 */
export async function getAlertsForZipcode(zipcode: string): Promise<string[]> {
  return await withClient(async (client) => {
    const query = `
      SELECT alert_id
      FROM weather_alert_zipcodes
      WHERE zipcode = $1
      ORDER BY created_at DESC
    `;
    const result = await client.query(query, [zipcode]);
    return result.rows.map((row) => row.alert_id);
  });
}

/**
 * Get all current alerts (from weather_alerts table) with their IDs.
 * Useful for enrichment scripts that need to process existing alerts.
 */
export async function getAllAlerts(): Promise<Array<{ id: string; raw: any }>> {
  return await withClient(async (client) => {
    const query = `
      SELECT id, raw
      FROM weather_alerts
      ORDER BY effective DESC
    `;
    const result = await client.query(query);
    return result.rows.map((row) => ({
      id: row.id,
      raw: row.raw,
    }));
  });
}

/**
 * Close the connection pool. Call this when shutting down the application.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

