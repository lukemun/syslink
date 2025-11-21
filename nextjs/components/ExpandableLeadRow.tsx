'use client';

/**
 * Accordion-style Lead Row Component
 * 
 * Purpose: Displays weather alerts as expandable accordions with lead opportunities for overlapping ZIP codes
 * 
 * Usage: Pass an EnrichedAlert object with computed lead scores for overlapping ZIPs
 * When expanded, shows:
 * - Damage keywords matched in alert text
 * - Lead opportunities table for all overlapping ZIPs with scoring details
 * - Census income data and score breakdown per ZIP
 */

import { useState } from 'react';
import type { EnrichedAlert } from '@/shared/alertsDb';
import type { LeadScoringOutput } from '@/shared/leadScoring';
import { explainScore } from '@/shared/leadScoring';
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

/**
 * Get score color class
 */
function getScoreColor(score: number): string {
  if (score >= 80) return 'bg-red-600 text-white';
  if (score >= 60) return 'bg-orange-500 text-white';
  if (score >= 40) return 'bg-yellow-500 text-black';
  return 'bg-gray-400 text-white';
}

/**
 * Format currency
 */
function formatCurrency(value: number | null): string {
  if (value === null) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format percentage
 */
function formatPercent(value: number | null): string {
  if (value === null) return 'N/A';
  return `${value.toFixed(1)}%`;
}

export interface LeadScoreData {
  zip: string;
  score: number;
  scoringOutput: LeadScoringOutput;
  censusData: {
    medianIncome: number | null;
    meanIncome: number | null;
    povertyRate: number | null;
    pctWealthyHouseholds: number | null;
    totalHouseholds: number | null;
  };
}

interface Props {
  alert: EnrichedAlert;
  scores: Record<string, LeadScoreData>; // Keyed by ZIP code
  maxScore: number; // Highest score among all overlapping ZIPs for this alert
}

export default function ExpandableLeadRow({ alert, scores, maxScore }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasUpdates = alert.updates && alert.updates.length > 0;
  
  const displayTime = alert.onset || alert.effective;
  const expiryTime = alert.expires;
  
  // Get all overlapping ZIPs with scores
  const leadOpportunities = alert.overlappingZips
    .map(zip => scores[zip])
    .filter(Boolean)
    .sort((a, b) => b.score - a.score); // Sort by score descending

  const highValueLeads = leadOpportunities.filter(l => l.score >= 60).length;

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

        {/* Column 4: Lead summary and disaster info */}
        <td className="px-6 py-4">
          <div className="flex items-center gap-3 mb-2">
            <span className={`inline-flex items-center justify-center w-12 h-12 rounded-full text-lg font-bold ${getScoreColor(maxScore)}`}>
              {maxScore}
            </span>
            <div>
              <div className="text-sm font-medium text-gray-900">
                {leadOpportunities.length} Lead{leadOpportunities.length !== 1 ? 's' : ''}
              </div>
              {highValueLeads > 0 && (
                <div className="text-xs text-green-600 font-medium">
                  {highValueLeads} High Value (≥60)
                </div>
              )}
            </div>
          </div>
          <div className="text-sm text-gray-700 mb-2">
            <span className="font-medium">Disaster Type:</span> {alert.disasterType}
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

      {/* Accordion Body - Lead Opportunities and Damage Keywords */}
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

              {/* Lead Opportunities Section */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">
                  Lead Opportunities ({leadOpportunities.length} High-Confidence ZIP{leadOpportunities.length !== 1 ? 's' : ''})
                </h4>
                
                {leadOpportunities.length > 0 ? (
                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            ZIP Code
                          </th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Lead Score
                          </th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Median Income
                          </th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Households
                          </th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Score Breakdown
                          </th>
                          <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Why This Lead
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {leadOpportunities.map((lead) => (
                          <tr key={lead.zip} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">{lead.zip}</div>
                              <div className="text-xs text-green-600">✓ Polygon + City</div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-sm font-bold ${getScoreColor(lead.score)}`}>
                                {lead.score}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {formatCurrency(lead.censusData.medianIncome)}
                              </div>
                              <div className="text-xs text-gray-500">
                                Mean: {formatCurrency(lead.censusData.meanIncome)}
                              </div>
                              {lead.censusData.povertyRate !== null && (
                                <div className="text-xs text-gray-500">
                                  Poverty: {formatPercent(lead.censusData.povertyRate)}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                              {lead.censusData.totalHouseholds?.toLocaleString() || 'N/A'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-xs text-gray-700 space-y-1">
                                <div>
                                  <span className="font-medium">Income:</span> {Math.round(lead.scoringOutput.breakdown.incomeFactor * 100)}%
                                </div>
                                <div>
                                  <span className="font-medium">Severity:</span> {Math.round(lead.scoringOutput.breakdown.severityFactor * 100)}%
                                </div>
                                <div>
                                  <span className="font-medium">Frequency:</span> {Math.round(lead.scoringOutput.breakdown.frequencyFactor * 100)}%
                                </div>
                                <div>
                                  <span className="font-medium">Confidence:</span> {Math.round(lead.scoringOutput.breakdown.overlapFactor * 100)}%
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-xs text-gray-600 space-y-1">
                                {explainScore(lead.scoringOutput).map((exp, idx) => (
                                  <div key={idx}>• {exp}</div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">
                      No lead opportunities available. This alert has no overlapping ZIP codes with census data.
                    </p>
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

