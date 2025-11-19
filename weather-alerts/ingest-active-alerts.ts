#!/usr/bin/env -S node --loader ts-node/esm
/**
 * Ingest active NWS alerts into the weather_alerts Postgres table.
 *
 * Purpose:
 * - Reads filtered active alerts from active-alerts.json (written by fetch-active-alerts.js).
 * - Maps each alert feature to an AlertRow, computing is_damaged based on config + keyword matching.
 * - Upserts rows into the weather_alerts table via the alertsDb module.
 *
 * Usage:
 *   node --loader ts-node/esm weather-alerts/ingest-active-alerts.ts
 *
 *   # Show verbose damage evaluation logs:
 *   DEBUG_DAMAGE=1 node --loader ts-node/esm weather-alerts/ingest-active-alerts.ts
 *
 * Environment:
 *   Requires DATABASE_URL for Postgres connection.
 *   Optional DEBUG_DAMAGE=1 for verbose is_damaged determination logs.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { upsertAlerts, upsertAlertZipcodes, closePool, AlertRow } from './db/alertsDb.js';
// @ts-ignore - JS config file
import { USED_FILTERS, DAMAGE_EVENT_CONFIG } from './alert-params-config.js';
// @ts-ignore - JS module
import { alertToZips } from './alert-to-zips.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Type definitions for alert feature
interface AlertFeature {
  id: string;
  type: string;
  geometry: any;
  properties: {
    id?: string;
    event?: string;
    status?: string;
    severity?: string;
    certainty?: string;
    urgency?: string;
    areaDesc?: string;
    sent?: string;
    effective?: string;
    onset?: string;
    expires?: string;
    ends?: string;
    sender?: string;
    senderName?: string;
    headline?: string;
    description?: string;
    instruction?: string;
    [key: string]: any;
  };
}

interface AlertData {
  features: AlertFeature[];
  [key: string]: any;
}

interface DamageEvaluation {
  isDamaged: boolean;
  reasons: string[];
}

/**
 * Parse weather_damage_triggers_extended.csv and extract all keywords into a flat list.
 * @returns {Promise<string[]>} Array of normalized keywords (lowercase, trimmed).
 */
async function loadDamageKeywords(): Promise<string[]> {
  const csvPath = path.join(__dirname, 'weather_damage_triggers_extended.csv');
  const content = await fs.readFile(csvPath, 'utf8');
  const lines = content.split('\n').slice(1); // skip header

  const keywords = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Simple CSV parse: split by comma, extract keywords_to_match (3rd column)
    const parts = line.split(',');
    if (parts.length < 3) continue;

    const keywordCol = parts[2]; // keywords_to_match column
    if (!keywordCol) continue;

    // Split by semicolon and normalize
    const phrases = keywordCol.split(';').map((p) => p.trim().toLowerCase());
    phrases.forEach((p) => {
      if (p) keywords.add(p);
    });
  }

  return Array.from(keywords);
}

/**
 * Evaluate whether an alert qualifies as damage-relevant.
 *
 * Checks:
 * 1. status = 'actual' (already enforced at fetch time)
 * 2. severity in USED_FILTERS.client.severity
 * 3. certainty in USED_FILTERS.client.certainty
 * 4. event in DAMAGE_EVENT_CONFIG.primaryUsed
 * 5. At least one keyword from damageKeywords matches headline/description/instruction
 *
 * @param feature - The alert feature from NWS GeoJSON.
 * @param damageKeywords - Global list of damage keywords from CSV.
 * @returns {DamageEvaluation} Object with isDamaged flag and reasons array.
 */
function evaluateDamage(
  feature: AlertFeature,
  damageKeywords: string[]
): DamageEvaluation {
  const props = feature.properties;
  const reasons: string[] = [];

  const status = (props.status || '').toLowerCase();
  const severity = (props.severity || '').toLowerCase();
  const certainty = (props.certainty || '').toLowerCase();
  const event = (props.event || '').toLowerCase();

  // Check 1: Status (should already be 'actual' from fetch filter)
  if (status !== 'actual') {
    reasons.push(`status=${status} (not actual)`);
    return { isDamaged: false, reasons };
  }

  // Check 2: Severity
  const allowedSeverities = (USED_FILTERS.client.severity || []).map((s: string) =>
    s.toLowerCase()
  );
  if (!allowedSeverities.includes(severity)) {
    reasons.push(`severity=${severity} (not in ${allowedSeverities.join(',')})`);
    return { isDamaged: false, reasons };
  }
  reasons.push(`severity=${severity} ✓`);

  // Check 3: Certainty
  const allowedCertainties = (USED_FILTERS.client.certainty || []).map((c: string) =>
    c.toLowerCase()
  );
  if (!allowedCertainties.includes(certainty)) {
    reasons.push(`certainty=${certainty} (not in ${allowedCertainties.join(',')})`);
    return { isDamaged: false, reasons };
  }
  reasons.push(`certainty=${certainty} ✓`);

  // Check 4: Event type
  const allowedEvents = (DAMAGE_EVENT_CONFIG.primaryUsed || []).map((e: string) =>
    e.toLowerCase()
  );
  if (!allowedEvents.includes(event)) {
    reasons.push(`event="${event}" (not in damage config)`);
    return { isDamaged: false, reasons };
  }
  reasons.push(`event="${event}" ✓`);

  // Check 5: Keyword match
  const textToSearch = [
    props.headline || '',
    props.description || '',
    props.instruction || '',
  ]
    .join(' ')
    .toLowerCase();

  const matchedKeywords: string[] = [];
  for (const keyword of damageKeywords) {
    if (textToSearch.includes(keyword)) {
      matchedKeywords.push(keyword);
      // We only need one match, but collect a few for logging
      if (matchedKeywords.length >= 3) break;
    }
  }

  if (matchedKeywords.length === 0) {
    reasons.push('no keyword match in text');
    return { isDamaged: false, reasons };
  }

  reasons.push(`keyword: "${matchedKeywords[0]}" ✓`);
  return { isDamaged: true, reasons };
}

/**
 * Map an alert feature to an AlertRow for database insertion.
 * @param feature - The alert feature from NWS GeoJSON.
 * @param damageKeywords - Global list of damage keywords.
 * @returns {AlertRow} Typed row object ready for upsert.
 */
function featureToAlertRow(
  feature: AlertFeature,
  damageKeywords: string[]
): AlertRow {
  const props = feature.properties;

  // Evaluate damage relevance
  const damageEval = evaluateDamage(feature, damageKeywords);

  // Parse timestamps (NWS uses ISO 8601 strings)
  const parseDate = (dateStr?: string): Date | null => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr);
    } catch {
      return null;
    }
  };

  const sent = parseDate(props.sent);
  const effective = parseDate(props.effective);

  if (!sent || !effective) {
    throw new Error(
      `Alert ${feature.id} missing required sent or effective timestamp`
    );
  }

  const row: AlertRow = {
    id: props.id || feature.id,
    event: props.event || 'Unknown',
    status: props.status || 'Unknown',
    severity: props.severity || null,
    certainty: props.certainty || null,
    urgency: props.urgency || null,
    area_desc: props.areaDesc || null,
    nws_office: props.senderName || props.sender || null,
    sent,
    effective,
    onset: parseDate(props.onset),
    expires: parseDate(props.expires || props.ends),
    is_damaged: damageEval.isDamaged,
    raw: feature, // Store full feature as JSONB
  };

  // Log damage determination if flag is set
  if (process.env.DEBUG_DAMAGE && damageEval.isDamaged) {
    console.log(
      `[DAMAGE] ${row.id} | ${row.event} | ${damageEval.reasons.join(', ')}`
    );
  }

  return row;
}

/**
 * Main entry point: load alerts, transform to rows, and upsert into database.
 */
async function main() {
  try {
    console.log('Loading active alerts from active-alerts.json...');
    const alertsPath = path.join(__dirname, 'active-alerts.json');
    const content = await fs.readFile(alertsPath, 'utf8');
    const data: AlertData = JSON.parse(content);

    if (!Array.isArray(data.features)) {
      throw new Error('active-alerts.json does not contain a valid features array');
    }

    console.log(`Found ${data.features.length} alerts in file.`);

    console.log('\nLoading damage keywords from weather_damage_triggers_extended.csv...');
    const damageKeywords = await loadDamageKeywords();
    console.log(`Loaded ${damageKeywords.length} unique keywords.`);

    console.log('\nTransforming alerts to AlertRow objects...');
    const rows: AlertRow[] = [];
    for (const feature of data.features) {
      try {
        const row = featureToAlertRow(feature, damageKeywords);
        rows.push(row);
      } catch (err) {
        console.error(
          `Warning: Failed to transform alert ${feature.id || 'unknown'}: ${
            (err as Error).message
          }`
        );
      }
    }

    console.log(`\nPrepared ${rows.length} rows for upsert.`);

    const damagedCount = rows.filter((r) => r.is_damaged).length;
    console.log(`  Damage-relevant alerts: ${damagedCount}`);

    console.log('\nUpserting alerts into weather_alerts table...');
    await upsertAlerts(rows);

    console.log('✓ Successfully upserted all alerts.');

    console.log('\n=== Enriching alerts with zipcode mappings ===');
    let enrichedCount = 0;
    let totalZipcodes = 0;
    let failedCount = 0;
    const failureReasons: Array<{
      alertId: string;
      event: string;
      areaDesc: string;
      sameCodes: string[];
      reason: string;
    }> = [];

    for (const feature of data.features) {
      try {
        const alertId = feature.properties.id || feature.id;
        const event = feature.properties.event || 'Unknown';
        const areaDesc = feature.properties.areaDesc || 'Unknown area';
        const sameCodes = feature.properties?.geocode?.SAME || [];
        
        // Use alertToZips to get affected zipcodes
        const zipResult = alertToZips(feature, {
          residentialRatioThreshold: 0.5, // Only include ZIPs that are at least 50% in the county
          geometry: feature.geometry, // Use polygon refinement when available
        });

        if (zipResult.zips && zipResult.zips.length > 0) {
          await upsertAlertZipcodes(alertId, zipResult.zips);
          enrichedCount++;
          totalZipcodes += zipResult.zips.length;
          
          console.log(`✓ [${enrichedCount}] ${event}`);
          console.log(`  Alert ID: ${alertId.substring(0, 60)}...`);
          console.log(`  SAME codes: [${sameCodes.join(', ')}]`);
          console.log(`  Mapped to: ${zipResult.zips.length} zipcode(s)`);
          console.log(`  Sample ZIPs: ${zipResult.zips.slice(0, 5).join(', ')}${zipResult.zips.length > 5 ? '...' : ''}`);
        } else {
          failedCount++;
          let reason = 'Unknown';
          
          if (sameCodes.length === 0) {
            reason = 'No SAME codes in alert';
          } else if (zipResult.counties.length === 0) {
            reason = 'SAME codes not found in lookup tables';
          } else if (zipResult.counties.every(c => c.zipCount === 0)) {
            reason = `SAME codes found but no ZIP mappings (likely marine/offshore zone: ${sameCodes.join(', ')})`;
          } else {
            reason = `Filtered out by threshold/geometry (counties: ${zipResult.counties.length}, potential zips: ${zipResult.counties.reduce((sum, c) => sum + c.zipCount, 0)})`;
          }
          
          failureReasons.push({
            alertId: alertId.substring(alertId.length - 40),
            event,
            areaDesc: areaDesc.substring(0, 60),
            sameCodes,
            reason,
          });
          
          console.log(`✗ [SKIP] ${event}`);
          console.log(`  Area: ${areaDesc.substring(0, 60)}`);
          console.log(`  SAME codes: [${sameCodes.join(', ')}]`);
          console.log(`  Reason: ${reason}`);
        }
        console.log('');
      } catch (err) {
        failedCount++;
        console.error(
          `✗ [ERROR] Failed to enrich alert ${feature.id || 'unknown'}: ${
            (err as Error).message
          }`
        );
        console.log('');
      }
    }

    console.log('=== Enrichment Summary ===');
    console.log(`✓ Successfully enriched: ${enrichedCount} alerts`);
    console.log(`  Total zipcode mappings: ${totalZipcodes}`);
    console.log(`  Average per alert: ${enrichedCount > 0 ? Math.round((totalZipcodes / enrichedCount) * 10) / 10 : 0} zipcodes`);
    console.log(`✗ Skipped/Failed: ${failedCount} alerts`);
    
    if (failureReasons.length > 0) {
      console.log('\n=== Failure Details ===');
      failureReasons.forEach((failure, index) => {
        console.log(`${index + 1}. ${failure.event}`);
        console.log(`   Alert: ...${failure.alertId}`);
        console.log(`   Area: ${failure.areaDesc}`);
        console.log(`   SAME: [${failure.sameCodes.join(', ')}]`);
        console.log(`   Reason: ${failure.reason}`);
      });
    }

    // Close database pool
    await closePool();
  } catch (error) {
    console.error('\n✗ Error ingesting alerts:');
    console.error(`  ${(error as Error).message}`);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { evaluateDamage, featureToAlertRow, loadDamageKeywords };

