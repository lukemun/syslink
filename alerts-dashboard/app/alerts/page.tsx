/**
 * Active Alerts Dashboard Page
 * 
 * Purpose: Displays active weather alerts sorted by earliest time first,
 * with enriched zip code data and severity/disaster type information.
 * 
 * This is a Server Component that directly queries the database.
 */

import { createClient } from '@/utils/supabase/server';
import { getActiveAlertsWithHistory } from '@/shared/alertsDb';
import type { EnrichedAlert } from '@/shared/alertsDb';
import ExpandableAlertRow from '@/components/ExpandableAlertRow';

/**
 * Note: AlertRow component has been replaced with ExpandableAlertRow
 * which is imported from components/ExpandableAlertRow.tsx
 */

/**
 * Main Page Component
 */
export default async function AlertsPage() {
  const supabase = await createClient();
  
  let alerts: EnrichedAlert[] = [];
  let error: string | null = null;

  try {
    alerts = await getActiveAlertsWithHistory(supabase, { 
      limit: 100,
      includeMarine: false // Filter out marine alerts with no zip codes
    });
  } catch (err) {
    console.error('Error loading alerts:', err);
    error = err instanceof Error ? err.message : 'Failed to load alerts';
  }

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Active Weather Alerts</h1>
          <p className="mt-2 text-sm text-gray-600">
            Sorted by earliest start time. Showing alerts with status "Actual" from the National Weather Service.
          </p>
          <div className="mt-4 flex items-center gap-4">
            <div className="text-sm text-gray-700">
              <span className="font-medium">Total Alerts:</span> {alerts.length}
            </div>
            <div className="text-sm text-gray-700">
              <span className="font-medium">Damage Risk:</span> {alerts.filter(a => a.is_damaged).length}
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
            <p className="font-medium">Error loading alerts</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Empty State */}
        {!error && alerts.length === 0 && (
          <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
            <p className="font-medium">No active alerts</p>
            <p className="text-sm mt-1">There are currently no active weather alerts in the database.</p>
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
          </p>
        </div>
      </div>
    </div>
  );
}

