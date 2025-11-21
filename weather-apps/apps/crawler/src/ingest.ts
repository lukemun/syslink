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

import { upsertAlerts, upsertAlertZipcodes, closePool, AlertRow, ZipcodeWithFlags } from './db.js';
import { USED_FILTERS, DAMAGE_EVENT_CONFIG } from './config.js';
import { alertToZips, sameCodesToZips } from './utils/alert-to-zips.js';
import { DAMAGE_KEYWORDS } from './damage-keywords.js';
import {
  extractCitiesFromDescription,
  filterZipsByCities,
  computeZipSetStats,
  logZipRefinement,
} from './utils/zip-refinement.js';

/**
 * Check if experimental ZIP refinement debug logging is enabled.
 * Logging only, does not affect production behavior.
 */
function isZipRefinementDebug(): boolean {
  return process.env.ZIP_REFINEMENT_DEBUG === '1';
}

/**
 * Check if dry-run mode is enabled (for local testing without database).
 */
function isDryRun(): boolean {
  return process.env.DRY_RUN === '1';
}

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
  matchedKeywords?: string[];
}

/**
 * Get damage keywords (now imported from compiled damage-keywords.ts).
 */
async function loadDamageKeywords(): Promise<string[]> {
  return DAMAGE_KEYWORDS;
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
      if (matchedKeywords.length >= 5) break; // Collect up to 5 keywords for logging
    }
  }

  if (matchedKeywords.length === 0) {
    reasons.push('no keyword match in text');
    return { isDamaged: false, reasons };
  }

  // Add all matched keywords to reasons
  const keywordSummary = matchedKeywords.length <= 3
    ? matchedKeywords.map(k => `"${k}"`).join(', ')
    : `${matchedKeywords.slice(0, 3).map(k => `"${k}"`).join(', ')} (+${matchedKeywords.length - 3} more)`;
  
  reasons.push(`keywords: ${keywordSummary} ✓`);
  return { isDamaged: true, reasons, matchedKeywords };
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

  if (process.env.DEBUG_DAMAGE) {
    const prefix = damageEval.isDamaged ? '[DAMAGE]' : '[NO-DAMAGE]';
    const keywords = damageEval.matchedKeywords 
      ? ` | Matched keywords: ${damageEval.matchedKeywords.join(', ')}`
      : '';
    console.log(
      `${prefix} ${row.event} | ${damageEval.reasons.join(', ')}${keywords}`
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
    const damageEvaluations = new Map<string, DamageEvaluation>();
    
    for (const feature of data.features) {
      try {
        const damageEval = evaluateDamage(feature, damageKeywords);
        const row = featureToAlertRow(feature, damageKeywords);
        rows.push(row);
        damageEvaluations.set(row.id, damageEval);
      } catch (err) {
        console.error(
          `Warning: Failed to transform alert ${feature.id || 'unknown'}: ${
            (err as Error).message
          }`
        );
      }
    }

    console.log(`Prepared ${rows.length} rows for upsert.`);

    const damagedRows = rows.filter((r) => r.is_damaged);
    const damagedCount = damagedRows.length;
    console.log(`  Damage-relevant alerts: ${damagedCount}`);
    
    // Show summary of damage-relevant alerts with matched keywords
    if (damagedCount > 0) {
      console.log('\n  Damage-relevant alerts summary:');
      for (const row of damagedRows) {
        const evaluation = damageEvaluations.get(row.id);
        const keywords = evaluation?.matchedKeywords 
          ? evaluation.matchedKeywords.slice(0, 3).join(', ')
          : 'unknown';
        console.log(`    • ${row.event} (${row.area_desc?.substring(0, 40) || 'N/A'}) - Keywords: ${keywords}`);
      }
    }

    if (isDryRun()) {
      console.log('\n[DRY-RUN] Skipping database upsert for weather_alerts table...');
      console.log('✓ Would have upserted', rows.length, 'alerts.');
    } else {
      console.log('Upserting alerts into weather_alerts table...');
      await upsertAlerts(rows);
      console.log('✓ Successfully upserted all alerts.');
    }

    console.log('\n=== Enriching alerts with zipcode mappings ===');
    let enrichedCount = 0;
    let totalZipcodes = 0;
    let failedCount = 0;
    let totalBaselineZips = 0; // Total ZIPs before refinement (county-only)
    let totalRefinedZips = 0;   // Total ZIPs after refinement
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
        
        // Get county-based ZIPs without geometry filtering (baseline)
        const allCountyZips = sameCodesToZips(sameCodes, {
          residentialRatioThreshold: 0.5,
          geometry: undefined, // No geometry filtering for baseline
        }).zips;
        
        // Get polygon-filtered ZIPs (using geometry + centroids)
        const zipResult = alertToZips(feature, {
          residentialRatioThreshold: 0.5,
          geometry: feature.geometry,
        });

        // Extract cities from alert text and compute city-filtered ZIPs
        const description = feature.properties.description || '';
        const headline = feature.properties.headline || '';
        const fullText = `${headline} ${description} ${areaDesc}`;
        const parsedCities = extractCitiesFromDescription(fullText);
        
        // Get state from first county if available
        const alertState = zipResult.counties.length > 0 && zipResult.counties[0].state 
          ? zipResult.counties[0].state 
          : undefined;
        
        // Compute city-filtered ZIPs
        const cityZips = filterZipsByCities(allCountyZips, parsedCities, alertState);

        // Build combined ZIP map with provenance flags
        const zipFlags = new Map<string, { fromCounty: boolean; fromPolygon: boolean; fromCity: boolean }>();
        
        // Mark all county-based ZIPs
        for (const zip of allCountyZips) {
          zipFlags.set(zip, { fromCounty: true, fromPolygon: false, fromCity: false });
        }
        
        // Mark polygon-filtered ZIPs
        for (const zip of zipResult.zips) {
          const existing = zipFlags.get(zip) || { fromCounty: false, fromPolygon: false, fromCity: false };
          zipFlags.set(zip, { ...existing, fromPolygon: true });
        }
        
        // Mark city-filtered ZIPs
        for (const zip of cityZips) {
          const existing = zipFlags.get(zip) || { fromCounty: false, fromPolygon: false, fromCity: false };
          zipFlags.set(zip, { ...existing, fromCity: true });
        }
        
        // Convert map to array of ZipcodeWithFlags
        const zipcodesWithFlags: ZipcodeWithFlags[] = Array.from(zipFlags.entries()).map(
          ([zipcode, flags]) => ({
            zipcode,
            fromCounty: flags.fromCounty,
            fromPolygon: flags.fromPolygon,
            fromCity: flags.fromCity,
          })
        );

        // Persist all ZIPs with their provenance flags
        if (zipcodesWithFlags.length > 0) {
          if (!isDryRun()) {
            await upsertAlertZipcodes(alertId, zipcodesWithFlags);
          }
          enrichedCount++;
          totalZipcodes += zipcodesWithFlags.length;
          
          // Count ZIPs by strategy
          const countyCount = zipcodesWithFlags.filter(z => z.fromCounty).length;
          const polygonCount = zipcodesWithFlags.filter(z => z.fromPolygon).length;
          const cityCount = zipcodesWithFlags.filter(z => z.fromCity).length;
          const intersectionCount = zipcodesWithFlags.filter(z => z.fromPolygon && z.fromCity).length;
          
          // Track baseline vs refined totals
          totalBaselineZips += countyCount;
          totalRefinedZips += polygonCount; // Using polygon as the refined set
          
          console.log(`✓ [${enrichedCount}] ${event}`);
          console.log(`  Alert ID: ${alertId.substring(0, 60)}...`);
          console.log(`  SAME codes: [${sameCodes.join(', ')}]`);
          console.log(`  Total unique ZIPs: ${zipcodesWithFlags.length}`);
          
          console.log(`  Strategy breakdown:`);
          console.log(`    County (baseline): ${countyCount} ZIPs`);
          console.log(`    Polygon-filtered: ${polygonCount} ZIPs (${countyCount > 0 ? Math.round((polygonCount / countyCount) * 100) : 0}% of baseline)`);
          if (parsedCities.size > 0) {
            console.log(`    City-filtered: ${cityCount} ZIPs (${countyCount > 0 ? Math.round((cityCount / countyCount) * 100) : 0}% of baseline)`);
            console.log(`    Polygon ∩ City: ${intersectionCount} ZIPs (high-confidence core)`);
            console.log(`    Cities detected: ${Array.from(parsedCities).join(', ')}`);
          }
          
          // Sample ZIPs from polygon set (typically the production default)
          const polygonZips = zipcodesWithFlags.filter(z => z.fromPolygon).map(z => z.zipcode);
          console.log(`  Sample polygon ZIPs: ${polygonZips.slice(0, 5).join(', ')}${polygonZips.length > 5 ? '...' : ''}`);

          
          // Detailed comparison for ZIP refinement debug mode
          if (isZipRefinementDebug()) {
            // Compute statistics
            const polygonZips = zipcodesWithFlags.filter(z => z.fromPolygon).map(z => z.zipcode);
            const cityZips = zipcodesWithFlags.filter(z => z.fromCity).map(z => z.zipcode);
            const stats = computeZipSetStats(
              allCountyZips,
              polygonZips,
              cityZips
            );
            
            // Log detailed experimental results
            logZipRefinement(
              alertId,
              event,
              stats,
              allCountyZips,
              polygonZips,
              cityZips,
              parsedCities
            );
          }
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

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║                    PROCESSING SUMMARY                          ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    if (isDryRun()) {
      console.log('⚠️  [DRY-RUN MODE] Database writes skipped\n');
    }
    console.log('📊 Alert Statistics:');
    console.log(`   • Total alerts fetched: ${data.features.length}`);
    console.log(`   • Alerts transformed: ${rows.length}`);
    console.log(`   • Damage-relevant: ${damagedCount} (${rows.length > 0 ? Math.round((damagedCount / rows.length) * 100) : 0}%)`);
    console.log(`   • ZIP-enriched: ${enrichedCount}`);
    console.log(`   • Skipped/Failed: ${failedCount}`);
    
    console.log('\n📍 ZIP Code Refinement:');
    console.log(`   • Baseline (county-only): ${totalBaselineZips} ZIPs`);
    console.log(`   • After polygon refinement: ${totalRefinedZips} ZIPs`);
    const reductionPct = totalBaselineZips > 0 
      ? Math.round(((totalBaselineZips - totalRefinedZips) / totalBaselineZips) * 100) 
      : 0;
    console.log(`   • Reduction: ${reductionPct}% (${totalBaselineZips - totalRefinedZips} ZIPs removed)`);
    console.log(`   • Total unique mappings: ${totalZipcodes} (includes all strategies)`);
    console.log(`   • Average per alert: ${enrichedCount > 0 ? Math.round((totalZipcodes / enrichedCount) * 10) / 10 : 0} ZIPs`);
    
    console.log('\n📝 Note: Each ZIP includes provenance flags (from_county, from_polygon, from_city)');
    console.log('════════════════════════════════════════════════════════════════\n');
    
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

    if (!isDryRun()) {
      await closePool();
    }
  } catch (error) {
    console.error('\n✗ Error ingesting alerts:');
    console.error(`  ${(error as Error).message}`);
    throw error;
  }
}

