'use client';

/**
 * Accordion-style Alert Row Component
 * 
 * Purpose: Displays weather alerts as expandable accordions showing ZIP code flow and damage keywords
 * 
 * Usage: Pass an EnrichedAlert object with categorized ZIP codes and damage keywords
 * When expanded, shows:
 * - Three-column left-to-right ZIP flow (candidate → refined → overlapping)
 * - Damage keywords matched in alert text
 * - Update history for superseded alerts
 */

import { useState } from 'react';
import type { EnrichedAlert } from '@/shared/alertsDb';
import LocalTime from './LocalTime';

function SeverityBadge({ 
  level, 
  color 
}: { 
  level: string; 
  color: string;
}) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {level.toUpperCase()}
    </span>
  );
}

interface Props {
  alert: EnrichedAlert;
}

export default function ExpandableAlertRow({ alert }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasUpdates = alert.updates && alert.updates.length > 0;
  
  const displayTime = alert.onset || alert.effective;
  const expiryTime = alert.expires;
  
  // Check if this alert has detailed provenance data
  const hasProvenanceData = alert.cityZips.length > 0 || alert.polygonZips.length > 0 || alert.overlappingZips.length > 0;

  return (
    <>
      {/* Accordion Header Row - clickable to expand/collapse */}
      <tr 
        className="hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Column 1: Core alert details with expand/collapse button */}
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-start gap-2">
            <button
              className="mt-1 text-gray-400 hover:text-gray-600 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? "Collapse details" : "Expand details"}
            >
              <svg
                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div className="flex flex-col">
              <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                {alert.event}
                {hasUpdates && alert.updates && (
                  <span className="text-xs text-blue-600 font-normal">
                    ({alert.updates.length} {alert.updates.length === 1 ? 'update' : 'updates'})
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                <div>Start: <LocalTime dateStr={displayTime} /></div>
                {expiryTime && (
                  <div>Expires: <LocalTime dateStr={expiryTime} /></div>
                )}
                <div className="text-gray-400">
                  Updated: <LocalTime dateStr={alert.updated_at} />
                </div>
              </div>
              {alert.message_type && alert.message_type !== 'Alert' && (
                <div className="text-xs text-purple-600 mt-1">
                  Type: {alert.message_type}
                </div>
              )}
            </div>
          </div>
        </td>

        {/* Column 2: Description */}
        <td className="px-6 py-4">
          <div className="text-sm text-gray-700 max-w-md">
            {alert.description ? (
              <div className="line-clamp-3" title={alert.description}>
                {alert.description}
              </div>
            ) : (
              <span className="text-gray-400 italic">No description</span>
            )}
          </div>
        </td>

        {/* Column 3: Location */}
        <td className="px-6 py-4">
          <div className="text-sm text-gray-900">
            {alert.area_desc || 'Unknown area'}
          </div>
          {alert.nws_office && (
            <div className="text-xs text-gray-500 mt-1">
              Office: {alert.nws_office}
            </div>
          )}
        </td>

        {/* Column 4: Zip codes summary and disaster info */}
        <td className="px-6 py-4">
          <div className="text-sm text-gray-900 mb-2">
            <span className="font-medium">Disaster Type:</span> {alert.disasterType}
          </div>
          <div className="text-sm text-gray-700 mb-2">
            <span className="font-medium">Zip Codes:</span>
            <div 
              className="mt-1 flex items-center gap-2" 
              title={alert.zipCodes.length > 3 ? alert.zipCodes.join(', ') : undefined}
            >
              <span className="cursor-help">{alert.zipSummary}</span>
              {alert.zipCodes.length > 0 && hasProvenanceData && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700 border border-green-300">
                  ✓ Enhanced
                </span>
              )}
              {alert.zipCodes.length > 0 && (
                <span className="text-xs text-blue-600">
                  (Click to expand →)
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <SeverityBadge level={alert.severityLevel} color={alert.severityColor} />
            {alert.is_damaged && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                🏚️ DAMAGE RISK
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-2">
            <div>Urgency: {alert.urgency || 'N/A'}</div>
            <div>Certainty: {alert.certainty || 'N/A'}</div>
          </div>
        </td>

        {/* Column 5: Status */}
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {alert.status}
        </td>
      </tr>

      {/* Accordion Body - ZIP Flow and Damage Keywords */}
      {isExpanded && (
        <tr className="bg-blue-50 border-t border-b border-blue-100">
          <td colSpan={5} className="px-6 py-6">
            <div className="space-y-6">
              {/* Damage Keywords Section */}
              {alert.damageKeywords.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">
                    Damage Keywords Matched
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {alert.damageKeywords.map((keyword) => (
                      <span 
                        key={keyword}
                        className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ZIP Code Flow Section */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">
                  Affected ZIP Codes Flow
                </h4>
                
                {/* Show categorized view if we have provenance data, otherwise show simple list */}
                {(alert.candidateZips.length > 0 || alert.cityZips.length > 0 || alert.polygonZips.length > 0 || alert.overlappingZips.length > 0) ? (
                  <div className="flex flex-col lg:flex-row gap-4 lg:gap-2 items-stretch">
                    {/* Column 1: Candidate ZIPs (from county) */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h5 className="text-xs font-medium text-gray-700 uppercase tracking-wide">
                          Candidate ZIPs
                        </h5>
                        <span className="text-xs text-gray-500">
                          ({alert.candidateZips.length})
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 mb-2">
                        From county/FIPS
                      </div>
                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-3 bg-white rounded-lg border border-gray-200 shadow-sm">
                        {alert.candidateZips.length > 0 ? (
                          alert.candidateZips.map((zip) => (
                            <span 
                              key={`candidate-${zip}`}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 border border-gray-300"
                            >
                              {zip}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400 italic">None</span>
                        )}
                      </div>
                    </div>

                  {/* Arrow indicator (desktop) */}
                  <div className="hidden lg:flex items-center justify-center px-1 pt-8">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  {/* Column 2: City ZIPs */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h5 className="text-xs font-medium text-gray-700 uppercase tracking-wide">
                        City-Refined ZIPs
                      </h5>
                      <span className="text-xs text-gray-500">
                        ({alert.cityZips.length})
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mb-2">
                      From city name match
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-3 bg-white rounded-lg border-2 border-purple-300 shadow-sm">
                      {alert.cityZips.length > 0 ? (
                        alert.cityZips.map((zip) => (
                          <span 
                            key={`city-${zip}`}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-800 font-medium border border-purple-400"
                          >
                            {zip}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400 italic">None</span>
                      )}
                    </div>
                  </div>

                  {/* Arrow indicator (desktop) */}
                  <div className="hidden lg:flex items-center justify-center px-1 pt-8">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  {/* Column 3: Polygon ZIPs */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h5 className="text-xs font-medium text-gray-700 uppercase tracking-wide">
                        Polygon-Refined ZIPs
                      </h5>
                      <span className="text-xs text-gray-500">
                        ({alert.polygonZips.length})
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mb-2">
                      From geometry boundary
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-3 bg-white rounded-lg border-2 border-blue-300 shadow-sm">
                      {alert.polygonZips.length > 0 ? (
                        alert.polygonZips.map((zip) => (
                          <span 
                            key={`polygon-${zip}`}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800 font-medium border border-blue-400"
                          >
                            {zip}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400 italic">None</span>
                      )}
                    </div>
                  </div>

                  {/* Arrow indicator (desktop) */}
                  <div className="hidden lg:flex items-center justify-center px-1 pt-8">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>

                  {/* Column 4: Overlapping ZIPs (polygon + city) */}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <h5 className="text-xs font-medium text-gray-700 uppercase tracking-wide">
                        High-Confidence ZIPs
                      </h5>
                      <span className="text-xs text-gray-500">
                        ({alert.overlappingZips.length})
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mb-2">
                      Polygon + city match
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-3 bg-white rounded-lg border-2 border-green-400 shadow-md">
                      {alert.overlappingZips.length > 0 ? (
                        alert.overlappingZips.map((zip) => (
                          <span 
                            key={`overlap-${zip}`}
                            className="inline-flex items-center px-2.5 py-1 rounded text-xs bg-green-100 text-green-900 font-bold border-2 border-green-500 shadow-sm"
                          >
                            {zip}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400 italic">None</span>
                      )}
                    </div>
                  </div>
                </div>
                ) : (
                  /* Fallback: Show all ZIPs without categorization */
                  <div className="p-4 bg-white rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <h5 className="text-xs font-medium text-gray-700 uppercase tracking-wide">
                        All Affected ZIP Codes
                      </h5>
                      <span className="text-xs text-gray-500">
                        ({alert.zipCodes.length})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {alert.zipCodes.length > 0 ? (
                        alert.zipCodes.map((zip) => (
                          <span 
                            key={`all-${zip}`}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800 border border-blue-300"
                          >
                            {zip}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400 italic">No ZIP codes available</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}

      {/* Update History Section */}
      {isExpanded && hasUpdates && alert.updates && (
        <tr className="bg-gray-50 border-t border-gray-200">
          <td colSpan={5} className="px-6 py-4">
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">
                Update History ({alert.updates.length} previous {alert.updates.length === 1 ? 'version' : 'versions'})
              </h4>
              {alert.updates.map((update, index) => {
                const updateDisplayTime = update.onset || update.effective;
                const updateExpiryTime = update.expires;
                
                return (
                  <div 
                    key={`${alert.id}-update-${index}`}
                    className="p-4 bg-white rounded border border-gray-200 space-y-3"
                  >
                    {/* Update header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-700 flex items-center gap-2">
                          {update.event}
                          <span className="text-xs text-gray-500">
                            (Version {alert.updates!.length - index})
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          <div>Start: <LocalTime dateStr={updateDisplayTime} /></div>
                          {updateExpiryTime && (
                            <div>Expires: <LocalTime dateStr={updateExpiryTime} /></div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <SeverityBadge level={update.severityLevel} color={update.severityColor} />
                        {update.is_damaged && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                            🏚️ DAMAGE
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Update description */}
                    {update.description && (
                      <div className="text-sm text-gray-600">
                        {update.description}
                      </div>
                    )}

                    {/* Update location and metadata */}
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <div>{update.area_desc || 'Unknown area'}</div>
                      <div>•</div>
                      <div>{update.zipSummary}</div>
                      <div>•</div>
                      <div>{update.disasterType}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

