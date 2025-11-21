/**
 * Leads API Route
 * 
 * Purpose: Fetches weather alerts with their associated zipcodes, enriches them with
 * census income data, and computes lead scores on the fly. Returns a ranked list of
 * leads for property acquisition targeting.
 * 
 * Usage:
 *   GET /api/leads?minScore=50&limit=100&state=TX&isDamaged=true
 * 
 * Query parameters:
 *   - minScore: Minimum lead score (0-100) to include
 *   - limit: Max number of leads to return (default 100)
 *   - state: Filter by state code (if available in census data)
 *   - zip: Filter by specific ZIP code
 *   - isDamaged: Filter for damage-relevant alerts only (true/false)
 *   - since: ISO date string - only include alerts sent on or after this date
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { scoreLead, explainScore } from '@/shared/leadScoring';

// Types
interface CensusIncomeRow {
  zip: string;
  median_household_income: number | null;
  mean_household_income: number | null;
  pct_people_poverty: number | null;
  pct_wealthy_households: number | null;
  total_households: number | null;
  per_capita_income: number | null;
  median_earnings_workers: number | null;
}

interface AlertZipRow {
  alert_id: string;
  zipcode: string;
  from_county: boolean;
  from_polygon: boolean;
  from_city: boolean;
}

interface AlertRow {
  id: string;
  event: string;
  severity: string | null;
  status: string;
  sent: string;
  effective: string;
  onset: string | null;
  expires: string | null;
  area_desc: string | null;
  headline: string | null;
  is_damaged: boolean;
}

interface Lead {
  // Alert info
  alertId: string;
  event: string;
  severity: string | null;
  headline: string | null;
  sent: string;
  effective: string;
  expires: string | null;
  areaDesc: string | null;
  isDamaged: boolean;
  
  // ZIP info
  zip: string;
  hasOverlap: boolean;
  
  // Census enrichment
  medianIncome: number | null;
  meanIncome: number | null;
  povertyRate: number | null;
  pctWealthyHouseholds: number | null;
  totalHouseholds: number | null;
  
  // Computed score
  leadScore: number;
  scoreBreakdown: {
    incomeFactor: number;
    severityFactor: number;
    frequencyFactor: number;
    overlapFactor: number;
  };
  scoreExplanation: string[];
  
  // Alert frequency
  recentAlertCount: number;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Parse query parameters
    const minScore = parseInt(searchParams.get('minScore') || '0');
    const limit = parseInt(searchParams.get('limit') || '100');
    const stateFilter = searchParams.get('state');
    const zipFilter = searchParams.get('zip');
    const isDamagedFilter = searchParams.get('isDamaged');
    const sinceParam = searchParams.get('since');
    
    // Create Supabase client
    const supabase = await createClient();
    
    // Step 1: Fetch recent alerts (last 30 days by default, or since parameter)
    const sinceDate = sinceParam 
      ? new Date(sinceParam)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    
    let alertQuery = supabase
      .from('weather_alerts')
      .select('id, event, severity, status, sent, effective, onset, expires, area_desc, headline:raw->properties->>headline, is_damaged')
      .eq('status', 'Actual')
      .gte('sent', sinceDate.toISOString())
      .order('sent', { ascending: false })
      .limit(1000); // Fetch more alerts initially, will be filtered
    
    if (isDamagedFilter === 'true') {
      alertQuery = alertQuery.eq('is_damaged', true);
    }
    
    const { data: alerts, error: alertError } = await alertQuery;
    
    if (alertError) {
      console.error('Error fetching alerts:', alertError);
      return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
    }
    
    if (!alerts || alerts.length === 0) {
      return NextResponse.json({ leads: [], count: 0, message: 'No alerts found' });
    }
    
    // Step 2: Fetch all ZIP mappings for these alerts
    const alertIds = alerts.map(a => a.id);
    const { data: alertZips, error: zipError } = await supabase
      .from('weather_alert_zipcodes')
      .select('alert_id, zipcode, from_county, from_polygon, from_city')
      .in('alert_id', alertIds);
    
    if (zipError) {
      console.error('Error fetching alert zipcodes:', zipError);
      return NextResponse.json({ error: 'Failed to fetch zipcodes' }, { status: 500 });
    }
    
    // Build alert -> zips mapping
    const alertToZips = new Map<string, AlertZipRow[]>();
    for (const az of alertZips || []) {
      if (!alertToZips.has(az.alert_id)) {
        alertToZips.set(az.alert_id, []);
      }
      alertToZips.get(az.alert_id)!.push(az);
    }
    
    // Step 3: Get unique ZIPs and fetch census data
    const uniqueZips = Array.from(new Set((alertZips || []).map(az => az.zipcode)));
    
    if (uniqueZips.length === 0) {
      return NextResponse.json({ leads: [], count: 0, message: 'No zipcodes associated with alerts' });
    }
    
    let censusQuery = supabase
      .from('census_income_by_zip')
      .select('zip, median_household_income, mean_household_income, pct_people_poverty, pct_wealthy_households, total_households, per_capita_income, median_earnings_workers')
      .in('zip', uniqueZips);
    
    if (stateFilter) {
      censusQuery = censusQuery.eq('state', stateFilter);
    }
    
    const { data: censusData, error: censusError } = await censusQuery;
    
    if (censusError) {
      console.error('Error fetching census data:', censusError);
      return NextResponse.json({ error: 'Failed to fetch census data' }, { status: 500 });
    }
    
    // Build ZIP -> census mapping
    const zipToCensus = new Map<string, CensusIncomeRow>();
    for (const c of censusData || []) {
      zipToCensus.set(c.zip, c);
    }
    
    // Step 4: Calculate alert frequency per ZIP (for scoring)
    const zipAlertCounts = new Map<string, number>();
    for (const az of alertZips || []) {
      zipAlertCounts.set(az.zipcode, (zipAlertCounts.get(az.zipcode) || 0) + 1);
    }
    
    // Step 5: Generate leads (one per alert-ZIP combination)
    const leads: Lead[] = [];
    
    for (const alert of alerts as AlertRow[]) {
      const alertZipRows = alertToZips.get(alert.id) || [];
      
      // Use polygon ZIPs if available, otherwise all ZIPs
      const polygonZips = alertZipRows.filter(az => az.from_polygon);
      const zipsToUse = polygonZips.length > 0 ? polygonZips : alertZipRows;
      
      for (const azRow of zipsToUse) {
        // Apply ZIP filter if specified
        if (zipFilter && azRow.zipcode !== zipFilter) {
          continue;
        }
        
        const census = zipToCensus.get(azRow.zipcode);
        
        // Skip if no census data (can't score)
        if (!census) {
          continue;
        }
        
        // Check if this ZIP has overlap (both polygon and city match)
        const hasOverlap = azRow.from_polygon && azRow.from_city;
        
        // Get recent alert count for this ZIP
        const recentAlertCount = zipAlertCounts.get(azRow.zipcode) || 1;
        
        // Score the lead
        const scoringResult = scoreLead({
          medianIncome: census.median_household_income,
          meanIncome: census.mean_household_income,
          povertyRate: census.pct_people_poverty,
          pctWealthyHouseholds: census.pct_wealthy_households,
          severity: alert.severity,
          event: alert.event,
          recentAlertCount: recentAlertCount,
          hasOverlap: hasOverlap,
        });
        
        // Apply minScore filter
        if (scoringResult.score < minScore) {
          continue;
        }
        
        const lead: Lead = {
          alertId: alert.id,
          event: alert.event,
          severity: alert.severity,
          headline: alert.headline,
          sent: alert.sent,
          effective: alert.effective,
          expires: alert.expires,
          areaDesc: alert.area_desc,
          isDamaged: alert.is_damaged,
          zip: azRow.zipcode,
          hasOverlap: hasOverlap,
          medianIncome: census.median_household_income,
          meanIncome: census.mean_household_income,
          povertyRate: census.pct_people_poverty,
          pctWealthyHouseholds: census.pct_wealthy_households,
          totalHouseholds: census.total_households,
          leadScore: scoringResult.score,
          scoreBreakdown: {
            incomeFactor: scoringResult.breakdown.incomeFactor,
            severityFactor: scoringResult.breakdown.severityFactor,
            frequencyFactor: scoringResult.breakdown.frequencyFactor,
            overlapFactor: scoringResult.breakdown.overlapFactor,
          },
          scoreExplanation: explainScore(scoringResult),
          recentAlertCount: recentAlertCount,
        };
        
        leads.push(lead);
      }
    }
    
    // Step 6: Sort by lead score (highest first) and apply limit
    leads.sort((a, b) => b.leadScore - a.leadScore);
    const limitedLeads = leads.slice(0, limit);
    
    return NextResponse.json({
      leads: limitedLeads,
      count: limitedLeads.length,
      totalBeforeLimit: leads.length,
      filters: {
        minScore,
        limit,
        state: stateFilter,
        zip: zipFilter,
        isDamaged: isDamagedFilter,
        since: sinceDate.toISOString(),
      },
    });
    
  } catch (error) {
    console.error('Unexpected error in /api/leads:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

