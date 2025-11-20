/**
 * Home page for Weather Alerts Dashboard
 * 
 * Simple landing page with overview statistics and link to active alerts.
 */

export default function Home() {
  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Weather Alerts Dashboard
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Real-time tracking of severe weather alerts with zip code enrichment and damage assessment
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href="/alerts"
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              View Active Alerts
            </a>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">
                Alert Monitoring
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">
                24/7
              </dd>
              <p className="mt-2 text-sm text-gray-600">
                Continuous tracking of NWS alerts
              </p>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">
                Zip Code Enrichment
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">
                Auto
              </dd>
              <p className="mt-2 text-sm text-gray-600">
                Automatic zip code identification from alert boundaries
              </p>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">
                Severity Tracking
              </dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">
                Multi
              </dd>
              <p className="mt-2 text-sm text-gray-600">
                Categorized by severity, urgency, and certainty
              </p>
            </div>
          </div>
        </div>

        <div className="mt-16 bg-white shadow rounded-lg p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">About This Dashboard</h2>
          <div className="prose prose-gray max-w-none">
            <p className="text-gray-600 mb-4">
              This dashboard provides real-time visibility into severe weather alerts issued by the 
              National Weather Service (NWS). It automatically enriches alerts with:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li>Affected zip codes derived from alert geographic boundaries</li>
              <li>Severity classifications (Extreme, Severe, Moderate, Minor)</li>
              <li>Disaster type categorization for property damage assessment</li>
              <li>Time-based sorting to prioritize the most urgent alerts</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
