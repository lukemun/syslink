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
 *   import { upsertAlerts, upsertAlertZipcodes, AlertRow } from './db/alertsDb.js';
 *   
 *   const rows: AlertRow[] = [...];
 *   await upsertAlerts(rows);
 *   
 *   await upsertAlertZipcodes('alert-123', ['90001', '90002']);
 *   const zips = await getZipcodesForAlert('alert-123');
 *
 * Environment:
 *   Requires DATABASE_URL in .env file at project root.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root (two levels up from db/ directory)
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

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
  message_type: string | null;
  references: unknown; // JSONB array of referenced alert IDs
  superseded_by: string | null;
  is_superseded: boolean;
  raw: unknown; // JSONB field
}

// Singleton connection pool
let pool: pg.Pool | null = null;

/**
 * Get or create the Postgres connection pool.
 * @returns {Pool} The shared pool instance.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'DATABASE_URL environment variable is required for database connection'
      );
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

/**
 * Execute a function with a database client from the pool.
 * Automatically acquires and releases the client.
 *
 * @param fn - Async function that receives a PoolClient and returns a value.
 * @returns The result of the function.
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
 *
 * @param alerts - Array of AlertRow objects to upsert.
 * @returns Promise that resolves when the operation completes.
 */
export async function upsertAlerts(alerts: AlertRow[]): Promise<void> {
  if (alerts.length === 0) {
    return;
  }

  await withClient(async (client) => {
    // Build parameterized INSERT ... ON CONFLICT statement
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
      'message_type',
      '"references"', // Quoted because it's a reserved SQL keyword
      'superseded_by',
      'is_superseded',
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
        alert.message_type,
        alert.references ? JSON.stringify(alert.references) : null,
        alert.superseded_by,
        alert.is_superseded,
        JSON.stringify(alert.raw) // JSONB expects JSON string in parameterized query
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

    await client.query(query, values);
  });
}

/**
 * Upsert zipcode mappings for a single alert into weather_alert_zipcodes table.
 * Uses INSERT ... ON CONFLICT to handle idempotent upserts.
 * Does not delete existing rows; only adds/updates the provided zipcodes.
 *
 * @param alertId - The alert ID (from weather_alerts.id).
 * @param zipcodes - Array of 5-digit zipcode strings to associate with this alert.
 * @returns Promise that resolves when the operation completes.
 */
export async function upsertAlertZipcodes(
  alertId: string,
  zipcodes: string[]
): Promise<void> {
  if (zipcodes.length === 0) {
    return;
  }

  await withClient(async (client) => {
    // Build parameterized INSERT ... ON CONFLICT statement
    const values: any[] = [];
    const valueStrings: string[] = [];
    let paramIndex = 1;

    for (const zipcode of zipcodes) {
      valueStrings.push(`($${paramIndex++}, $${paramIndex++})`);
      values.push(alertId, zipcode);
    }

    const query = `
      INSERT INTO weather_alert_zipcodes (alert_id, zipcode)
      VALUES ${valueStrings.join(', ')}
      ON CONFLICT (alert_id, zipcode) DO NOTHING
    `;

    await client.query(query, values);
  });
}

/**
 * Get all zipcodes associated with a specific alert.
 *
 * @param alertId - The alert ID to query.
 * @returns Promise that resolves to an array of zipcode strings.
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
 *
 * @param zipcode - The 5-digit zipcode to query.
 * @returns Promise that resolves to an array of alert IDs.
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
 *
 * @returns Promise that resolves to an array of objects with id and raw (full GeoJSON feature).
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
 * Update supersession chain for all alerts based on their references.
 * This marks older alerts as superseded when newer alerts reference them.
 * 
 * @returns Promise that resolves when the operation completes.
 */
export async function updateSupersessionChain(): Promise<void> {
  await withClient(async (client) => {
    // First, reset all is_superseded flags
    await client.query(`
      UPDATE weather_alerts
      SET is_superseded = FALSE, superseded_by = NULL
    `);

    // Find all alerts that have references (these are updates)
    const query = `
      SELECT id, "references"
      FROM weather_alerts
      WHERE "references" IS NOT NULL AND "references" != 'null'::jsonb
    `;
    const result = await client.query(query);

    // For each alert with references, mark the referenced alerts as superseded
    for (const row of result.rows) {
      const alertId = row.id;
      const references = row.references;

      if (Array.isArray(references) && references.length > 0) {
        // Extract the referenced alert IDs
        const referencedIds = references
          .map((ref: any) => {
            if (typeof ref === 'string') return ref;
            if (ref && typeof ref === 'object') {
              return ref.identifier || ref['@id'] || ref.id;
            }
            return null;
          })
          .filter((id: any) => id !== null);

        if (referencedIds.length > 0) {
          // Mark the referenced alerts as superseded by this alert
          const updateQuery = `
            UPDATE weather_alerts
            SET is_superseded = TRUE, superseded_by = $1
            WHERE id = ANY($2)
          `;
          await client.query(updateQuery, [alertId, referencedIds]);
        }
      }
    }
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

