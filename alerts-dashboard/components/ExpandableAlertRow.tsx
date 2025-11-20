'use client';

/**
 * Expandable Alert Row Component
 * 
 * Shows a primary alert with option to expand and view update history
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

  return (
    <>
      {/* Main Alert Row */}
      <tr className={`hover:bg-gray-50 transition-colors ${hasUpdates ? 'cursor-pointer' : ''}`}
          onClick={() => hasUpdates && setIsExpanded(!isExpanded)}>
        {/* Column 1: Core alert details */}
        <td className="px-6 py-4 whitespace-nowrap">
          <div className="flex items-start gap-2">
            {hasUpdates && (
              <button
                className="mt-1 text-gray-400 hover:text-gray-600 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                aria-label={isExpanded ? "Collapse updates" : "Expand updates"}
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
            )}
            <div className="flex flex-col">
              <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                {alert.event}
                {hasUpdates && alert.updates && (
                  <span className="text-xs text-blue-600 font-normal">
                    ({alert.updates.length} {alert.updates.length === 1 ? 'update' : 'updates'})
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                <div>Start: <LocalTime dateStr={displayTime} /></div>
                {expiryTime && (
                  <div>Expires: <LocalTime dateStr={expiryTime} /></div>
                )}
              </div>
              {alert.message_type && alert.message_type !== 'Alert' && (
                <div className="text-xs text-purple-600 mt-1">
                  Type: {alert.message_type}
                </div>
              )}
            </div>
          </div>
        </td>

        {/* Column 2: Location */}
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

        {/* Column 3: Zip codes and disaster info */}
        <td className="px-6 py-4">
          <div className="text-sm text-gray-900 mb-2">
            <span className="font-medium">Disaster Type:</span> {alert.disasterType}
          </div>
          <div className="text-sm text-gray-700 mb-2">
            <span className="font-medium">Zip Codes:</span>
            <div 
              className="mt-1 cursor-help" 
              title={alert.zipCodes.length > 3 ? alert.zipCodes.join(', ') : undefined}
            >
              {alert.zipSummary}
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

        {/* Column 4: Status */}
        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
          {alert.status}
        </td>
      </tr>

      {/* Expanded Update History Rows */}
      {isExpanded && hasUpdates && alert.updates && alert.updates.map((update, index) => {
        const updateDisplayTime = update.onset || update.effective;
        const updateExpiryTime = update.expires;
        
        return (
          <tr key={`${alert.id}-update-${index}`} className="bg-blue-50">
            {/* Column 1: Core alert details */}
            <td className="px-6 py-4 whitespace-nowrap">
              <div className="flex items-start gap-2 pl-8">
                <div className="flex flex-col">
                  <div className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    {update.event}
                    <span className="text-xs text-gray-500">
                      (Previous version)
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    <div>Start: <LocalTime dateStr={updateDisplayTime} /></div>
                    {updateExpiryTime && (
                      <div>Expires: <LocalTime dateStr={updateExpiryTime} /></div>
                    )}
                  </div>
                  {update.message_type && (
                    <div className="text-xs text-purple-600 mt-1">
                      Type: {update.message_type}
                    </div>
                  )}
                </div>
              </div>
            </td>

            {/* Column 2: Location */}
            <td className="px-6 py-4">
              <div className="text-sm text-gray-700">
                {update.area_desc || 'Unknown area'}
              </div>
              {update.nws_office && (
                <div className="text-xs text-gray-500 mt-1">
                  Office: {update.nws_office}
                </div>
              )}
            </td>

            {/* Column 3: Zip codes and disaster info */}
            <td className="px-6 py-4">
              <div className="text-sm text-gray-700 mb-2">
                <span className="font-medium">Disaster Type:</span> {update.disasterType}
              </div>
              <div className="text-sm text-gray-600 mb-2">
                <span className="font-medium">Zip Codes:</span>
                <div 
                  className="mt-1 cursor-help" 
                  title={update.zipCodes.length > 3 ? update.zipCodes.join(', ') : undefined}
                >
                  {update.zipSummary}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <SeverityBadge level={update.severityLevel} color={update.severityColor} />
                {update.is_damaged && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-200">
                    🏚️ DAMAGE RISK
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-2">
                <div>Urgency: {update.urgency || 'N/A'}</div>
                <div>Certainty: {update.certainty || 'N/A'}</div>
              </div>
            </td>

            {/* Column 4: Status */}
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {update.status}
            </td>
          </tr>
        );
      })}
    </>
  );
}

