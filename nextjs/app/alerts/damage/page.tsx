/**
 * Damage Alerts Dashboard Page
 * 
 * Purpose: Displays weather alerts from the last 7 days that have been flagged
 * as damage-qualified (is_damaged = true), with enriched zip code data and 
 * severity/disaster type information.
 * 
 * This is a Server Component that directly queries the database with damage
 * and time-window filters applied.
 */

import { createClient } from '@/utils/supabase/server';
import { getActiveAlertsWithHistory } from '@/shared/alertsDb';
import type { EnrichedAlert } from '@/shared/alertsDb';
import ExpandableAlertRow from '@/components/ExpandableAlertRow';
import LocalTime from '@/components/LocalTime';

/**
 * Calculate the date 7 days ago from now
 */
function getSevenDaysAgo(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date;
}

/**
 * Main Damage Alerts Page Component
 */
export default async function DamageAlertsPage() {
  const supabase = await createClient();
  
  let alerts: EnrichedAlert[] = [];
  let error: string | null = null;

  try {
    const sevenDaysAgo = getSevenDaysAgo();
    
    alerts = await getActiveAlertsWithHistory(supabase, { 
      limit: 100,
      includeMarine: false, // Filter out marine alerts with no zip codes
      is_damaged: true, // Only show alerts flagged as damage-qualified
      since: sevenDaysAgo, // Only alerts from last 7 days
    });
    
    // Log for debugging
    console.log('[Damage Alerts Page] Loaded alerts:', {
      count: alerts.length,
      sevenDaysAgo: sevenDaysAgo.toISOString(),
      firstAlertId: alerts[0]?.id?.substring(0, 40),
      firstAlertEvent: alerts[0]?.event,
      firstAlertDamaged: alerts[0]?.is_damaged,
    });
  } catch (err) {
    console.error('Error loading damage alerts:', err);
    error = err instanceof Error ? err.message : 'Failed to load damage alerts';
  }

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Damage Alerts (Last 7 Days)</h1>
              <p className="mt-2 text-sm text-gray-600">
                Showing alerts with potential property damage from the last 7 days. 
                These alerts meet damage-relevance criteria including extreme/severe severity, 
                observed/likely certainty, and damage-capable event types.
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
              <span className="font-medium">Total Damage Alerts:</span> {alerts.length}
            </div>
            <div className="text-sm text-gray-700">
              <span className="font-medium">Date Range:</span> Last 7 days
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
            <p className="font-medium">Error loading damage alerts</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Empty State */}
        {!error && alerts.length === 0 && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
            <p className="font-medium">No damage alerts in the last 7 days</p>
            <p className="text-sm mt-1">
              There are currently no active weather alerts meeting damage criteria from the past week.
            </p>
          </div>
        )}

        {/* Alerts Table */}
        {!error && alerts.length > 0 && (
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
                      Zip Codes & Severity
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {alerts.map((alert) => (
                    <ExpandableAlertRow key={alert.id} alert={alert} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer Info */}
        <div className="mt-6 text-sm text-gray-500">
          <p>
            Data refreshed from the National Weather Service. Times displayed in your local timezone.
            Alerts are filtered to show only those with damage risk from the last 7 days.
          </p>
        </div>
      </div>
    </div>
  );
}

