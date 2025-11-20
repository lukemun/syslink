/**
 * Ingest active NWS alerts into the weather_alerts Postgres table.
 *
 * Purpose:
 * - Accepts filtered active alerts data (from fetch module).
 * - Maps each alert feature to an AlertRow, computing is_damaged based on config + keyword matching.
 * - Upserts rows into the weather_alerts table and enriches with zipcode mappings.
 *
 * Usage:
 *   import { ingestAlerts } from './ingest.js';
 *   const data = await fetchAlerts();
 *   await ingestAlerts(data);
 *
 * Environment:
 *   Requires DATABASE_URL for Postgres connection.
 *   Optional DEBUG_DAMAGE=1 for verbose is_damaged determination logs.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { upsertAlerts, upsertAlertZipcodes, closePool, AlertRow } from './db.js';
import { USED_FILTERS, DAMAGE_EVENT_CONFIG } from './config.js';
import { alertToZips } from './utils/alert-to-zips.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    geocode?: {
      SAME?: string[];
    };
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
 */
async function loadDamageKeywords(): Promise<string[]> {
  const csvPath = path.join(__dirname, 'weather_damage_triggers_extended.csv');
  const content = await fs.promises.readFile(csvPath, 'utf8');
  const lines = content.split('\n').slice(1); // skip header

  const keywords = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = line.split(',');
    if (parts.length < 3) continue;

    const keywordCol = parts[2];
    if (!keywordCol) continue;

    const phrases = keywordCol.split(';').map((p) => p.trim().toLowerCase());
    phrases.forEach((p) => {
      if (p) keywords.add(p);
    });
  }

  return Array.from(keywords);
}

/**
 * Evaluate whether an alert qualifies as damage-relevant.
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

  // Check 1: Status
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
 */
function featureToAlertRow(
  feature: AlertFeature,
  damageKeywords: string[]
): AlertRow {
  const props = feature.properties;

  const damageEval = evaluateDamage(feature, damageKeywords);

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
    raw: feature,
  };

  if (process.env.DEBUG_DAMAGE && damageEval.isDamaged) {
    console.log(
      `[DAMAGE] ${row.id} | ${row.event} | ${damageEval.reasons.join(', ')}`
    );
  }

  return row;
}

/**
 * Main entry point: ingest alerts from data object, transform to rows, and upsert into database.
 */
export async function ingestAlerts(data: AlertData): Promise<void> {
  try {
    if (!Array.isArray(data.features)) {
      throw new Error('Data does not contain a valid features array');
    }

    console.log(`Processing ${data.features.length} alerts...`);

    console.log('Loading damage keywords from weather_damage_triggers_extended.csv...');
    const damageKeywords = await loadDamageKeywords();
    console.log(`Loaded ${damageKeywords.length} unique keywords.`);

    console.log('Transforming alerts to AlertRow objects...');
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

    console.log(`Prepared ${rows.length} rows for upsert.`);

    const damagedCount = rows.filter((r) => r.is_damaged).length;
    console.log(`  Damage-relevant alerts: ${damagedCount}`);

    console.log('Upserting alerts into weather_alerts table...');
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
        
        const zipResult = alertToZips(feature, {
          residentialRatioThreshold: 0.5,
          geometry: feature.geometry,
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

    await closePool();
  } catch (error) {
    console.error('\n✗ Error ingesting alerts:');
    console.error(`  ${(error as Error).message}`);
    throw error;
  }
}

