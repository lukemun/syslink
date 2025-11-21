/**
 * Leads Dashboard Page
 * 
 * Purpose: Displays weather alerts grouped by alert, with expandable details showing
 * lead opportunities for overlapping ZIP codes enriched with census income data and scoring.
 * 
 * This is a Server Component that directly queries the database for alerts and census data.
 */

import { createClient } from '@/utils/supabase/server';
import { getActiveAlertsWithHistory } from '@/shared/alertsDb';
import { scoreLead } from '@/shared/leadScoring';
import type { EnrichedAlert } from '@/shared/alertsDb';
import type { LeadScoringOutput } from '@/shared/leadScoring';
import ExpandableLeadRow, { type LeadScoreData } from '@/components/ExpandableLeadRow';
import LocalTime from '@/components/LocalTime';

/**
 * Census data structure
 */
interface CensusIncomeRow {
  zip: string;
  median_household_income: number | null;
  mean_household_income: number | null;
  pct_people_poverty: number | null;
  pct_wealthy_households: number | null;
  total_households: number | null;
}

/**
 * Alert with computed lead scores
 */
interface AlertWithLeads extends EnrichedAlert {
  leadScores: Record<string, LeadScoreData>;
  maxScore: number;
  leadCount: number;
}


/**
 * Main Page Component
 */
export default async function LeadsPage() {
  const supabase = await createClient();
  
  let alertsWithLeads: AlertWithLeads[] = [];
  let error: string | null = null;

  try {
    // Step 1: Fetch active alerts with history
    const alerts = await getActiveAlertsWithHistory(supabase, { 
      limit: 100,
      includeMarine: false // Filter out marine alerts with no zip codes
    });
    
    console.log('[Leads Page] Loaded alerts:', alerts.length);
    
    // Step 2: Filter to only alerts with overlapping ZIPs
    const alertsWithOverlappingZips = alerts.filter(alert => alert.overlappingZips.length > 0);
    
    console.log('[Leads Page] Alerts with overlapping ZIPs:', alertsWithOverlappingZips.length);
    
    // Step 3: Extract all unique overlapping ZIP codes
    const allOverlappingZips = new Set<string>();
    for (const alert of alertsWithOverlappingZips) {
      for (const zip of alert.overlappingZips) {
        allOverlappingZips.add(zip);
      }
    }
    
    console.log('[Leads Page] Unique overlapping ZIPs:', allOverlappingZips.size);
    
    // Step 4: Batch fetch census data for all overlapping ZIPs
    const { data: censusData, error: censusError } = await supabase
      .from('census_income_by_zip')
      .select('zip, median_household_income, mean_household_income, pct_people_poverty, pct_wealthy_households, total_households')
      .in('zip', Array.from(allOverlappingZips));
    
    if (censusError) {
      console.error('Error fetching census data:', censusError);
      throw new Error(`Failed to fetch census data: ${censusError.message}`);
    }
    
    console.log('[Leads Page] Census data rows:', censusData?.length || 0);
    
    // Build ZIP -> census mapping
    const zipToCensus = new Map<string, CensusIncomeRow>();
    for (const c of censusData || []) {
      zipToCensus.set(c.zip, c);
    }
    
    // Step 5: Calculate alert frequency per ZIP (for scoring)
    const zipAlertCounts = new Map<string, number>();
    for (const alert of alertsWithOverlappingZips) {
      for (const zip of alert.overlappingZips) {
        zipAlertCounts.set(zip, (zipAlertCounts.get(zip) || 0) + 1);
      }
    }
    
    // Step 6: Compute lead scores for each alert's overlapping ZIPs
    alertsWithLeads = alertsWithOverlappingZips
      .map(alert => {
        const leadScores: Record<string, LeadScoreData> = {};
        let maxScore = 0;
        
        for (const zip of alert.overlappingZips) {
          const census = zipToCensus.get(zip);
          
          // Skip ZIPs without census data
          if (!census) {
            console.log(`[Leads Page] Skipping ZIP ${zip} - no census data`);
            continue;
          }
          
          // Calculate score
          const recentAlertCount = zipAlertCounts.get(zip) || 1;
          const scoringOutput = scoreLead({
            medianIncome: census.median_household_income,
            meanIncome: census.mean_household_income,
            povertyRate: census.pct_people_poverty,
            pctWealthyHouseholds: census.pct_wealthy_households,
            severity: alert.severity,
            event: alert.event,
            recentAlertCount,
            hasOverlap: true, // By definition, these are overlapping ZIPs
          });
          
          leadScores[zip] = {
            zip,
            score: scoringOutput.score,
            scoringOutput,
            censusData: {
              medianIncome: census.median_household_income,
              meanIncome: census.mean_household_income,
              povertyRate: census.pct_people_poverty,
              pctWealthyHouseholds: census.pct_wealthy_households,
              totalHouseholds: census.total_households,
            },
          };
          
          if (scoringOutput.score > maxScore) {
            maxScore = scoringOutput.score;
          }
        }
        
        return {
          ...alert,
          leadScores,
          maxScore,
          leadCount: Object.keys(leadScores).length,
        };
      })
      .filter(alert => alert.leadCount > 0) // Filter out alerts with no scoreable leads
      .sort((a, b) => b.maxScore - a.maxScore); // Sort by highest score descending
    
    console.log('[Leads Page] Final alerts with leads:', alertsWithLeads.length);
    
  } catch (err) {
    console.error('Error loading leads:', err);
    error = err instanceof Error ? err.message : 'Failed to load leads';
  }

  const totalLeads = alertsWithLeads.reduce((sum, alert) => sum + alert.leadCount, 0);
  const highValueLeads = alertsWithLeads.reduce((sum, alert) => {
    return sum + Object.values(alert.leadScores).filter(l => l.score >= 60).length;
  }, 0);

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Property Acquisition Leads</h1>
              <p className="mt-2 text-sm text-gray-600">
                Weather alerts grouped by event with high-confidence lead opportunities.
                Expand each alert to see scored ZIP codes with census income data.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500 uppercase tracking-wide">Page Loaded</div>
              <div className="text-sm font-medium text-gray-900 mt-1">
                <LocalTime dateStr={new Date().toISOString()} />
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className="text-sm text-gray-700">
              <span className="font-medium">Active Alerts:</span> {alertsWithLeads.length}
            </div>
            <div className="text-sm text-gray-700">
              <span className="font-medium">Total Leads:</span> {totalLeads}
            </div>
            <div className="text-sm text-gray-700">
              <span className="font-medium">High Value (≥60):</span> {highValueLeads}
            </div>
            <div className="text-sm text-gray-700">
              <span className="font-medium">Damage Risk:</span>{' '}
              {alertsWithLeads.filter(a => a.is_damaged).length}
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
            <p className="font-medium">Error loading leads</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Empty State */}
        {!error && alertsWithLeads.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded">
            <p className="font-medium">No leads available</p>
            <p className="text-sm mt-1">
              There are currently no weather alerts with overlapping ZIP codes that have census data. 
              Ensure the census data has been imported and there are active alerts with high-confidence ZIP matches.
            </p>
          </div>
        )}

        {/* Alerts Table */}
        {!error && alertsWithLeads.length > 0 && (
          <div className="bg-white shadow overflow-hidden sm:rounded-lg">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Event & Time
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Location
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Lead Score & Opportunities
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {alertsWithLeads.map((alert) => (
                    <ExpandableLeadRow 
                      key={alert.id} 
                      alert={alert} 
                      scores={alert.leadScores}
                      maxScore={alert.maxScore}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Scoring Legend */}
        <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">Lead Scoring Guide</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
            <div>
              <span className="font-medium">Score Components:</span>
              <ul className="mt-1 space-y-1 text-xs">
                <li>• Income (30%): Lower income areas score higher</li>
                <li>• Severity (30%): More severe alerts score higher</li>
                <li>• Frequency (30%): Multiple recent alerts score higher</li>
                <li>• Confidence (10%): Polygon + city match boost</li>
              </ul>
            </div>
            <div>
              <span className="font-medium">Score Ranges:</span>
              <ul className="mt-1 space-y-1 text-xs">
                <li>• 80-100: <span className="font-semibold text-red-600">Hot Lead</span> - High priority</li>
                <li>• 60-79: <span className="font-semibold text-orange-600">Warm Lead</span> - Good opportunity</li>
                <li>• 40-59: <span className="font-semibold text-yellow-600">Moderate Lead</span> - Consider</li>
                <li>• 0-39: <span className="font-semibold text-gray-600">Cool Lead</span> - Lower priority</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="mt-6 text-sm text-gray-500">
          <p>
            Lead scores are calculated in real-time based on census income data and alert characteristics.
            Data refreshed from the National Weather Service and US Census ACS 5-year estimates (2023).
            Times displayed in your local timezone.
          </p>
        </div>
      </div>
    </div>
  );
}

