/**
 * Lead Scoring Module
 * 
 * Purpose: Computes a 0-100 lead score for weather alert + zipcode combinations
 * based on economic factors and alert characteristics to prioritize cash sale opportunities.
 * 
 * Usage:
 *   import { scoreLead, SCORING_WEIGHTS } from '@/shared/leadScoring';
 *   const result = scoreLead({ medianIncome: 45000, severity: 'Severe', ... });
 *   console.log(`Score: ${result.score}, Breakdown:`, result.breakdown);
 */

// Scoring weights (sum to 1.0)
export const SCORING_WEIGHTS = {
  income: 0.3,      // Lower income = higher score (more likely to need cash)
  severity: 0.3,    // More severe alerts = higher score
  frequency: 0.3,   // More frequent alerts = higher score
  overlap: 0.1,     // Overlap between city and polygon = confidence boost
};

// Severity mapping (NWS severity levels to 0-1 scale)
const SEVERITY_MAP: Record<string, number> = {
  'Extreme': 1.0,
  'Severe': 0.75,
  'Moderate': 0.5,
  'Minor': 0.25,
  'Unknown': 0.1,
};

// Event type to severity boost (some events are more likely to cause damage)
const EVENT_DAMAGE_BOOST: Record<string, number> = {
  'Tornado Warning': 1.0,
  'Flash Flood Warning': 0.9,
  'Severe Thunderstorm Warning': 0.8,
  'Hurricane Warning': 1.0,
  'Tropical Storm Warning': 0.7,
  'Winter Storm Warning': 0.6,
  'Blizzard Warning': 0.7,
  'Ice Storm Warning': 0.8,
  'Fire Weather Watch': 0.5,
  'Red Flag Warning': 0.6,
};

export interface LeadScoringInput {
  // Census income data
  medianIncome: number | null;
  meanIncome: number | null;
  povertyRate: number | null;          // Percentage (e.g., 15.5 for 15.5%)
  pctWealthyHouseholds: number | null; // Percentage of $200k+ households
  
  // Alert characteristics
  severity: string | null;             // 'Extreme', 'Severe', 'Moderate', 'Minor', 'Unknown'
  event: string;                       // Full event name from NWS
  
  // Alert frequency
  recentAlertCount: number;            // Number of alerts in last N days for this ZIP
  
  // Overlap/confidence flag
  hasOverlap: boolean;                 // True if ZIP is in both polygon and city match
}

export interface LeadScoringOutput {
  score: number;           // Final score 0-100
  breakdown: {
    incomeFactor: number;     // 0-1
    severityFactor: number;   // 0-1
    frequencyFactor: number;  // 0-1
    overlapFactor: number;    // 0-1
    weightedComponents: {
      income: number;
      severity: number;
      frequency: number;
      overlap: number;
    };
  };
}

/**
 * Calculate income factor (0-1)
 * Lower income = higher factor (inverse relationship)
 * Uses median income as primary indicator, with poverty rate as secondary
 */
function calculateIncomeFactor(input: LeadScoringInput): number {
  const { medianIncome, povertyRate } = input;
  
  // If no income data, return neutral score
  if (medianIncome === null || medianIncome === 0) {
    return 0.5;
  }
  
  // Define income brackets for scoring
  // Higher scores for lower income (these are more likely cash sale targets)
  let incomeFactor = 0;
  
  if (medianIncome < 30000) {
    incomeFactor = 1.0;
  } else if (medianIncome < 45000) {
    incomeFactor = 0.85;
  } else if (medianIncome < 60000) {
    incomeFactor = 0.7;
  } else if (medianIncome < 75000) {
    incomeFactor = 0.55;
  } else if (medianIncome < 100000) {
    incomeFactor = 0.4;
  } else if (medianIncome < 150000) {
    incomeFactor = 0.25;
  } else {
    incomeFactor = 0.1;
  }
  
  // Boost by poverty rate if available (higher poverty = higher score)
  if (povertyRate !== null && povertyRate > 0) {
    const povertyBoost = Math.min(povertyRate / 100, 0.5); // Cap at 50% boost
    incomeFactor = Math.min(incomeFactor + povertyBoost * 0.2, 1.0);
  }
  
  return incomeFactor;
}

/**
 * Calculate severity factor (0-1)
 * Maps NWS severity levels and event types to damage likelihood
 */
function calculateSeverityFactor(input: LeadScoringInput): number {
  const { severity, event } = input;
  
  // Base severity score
  const baseSeverity = SEVERITY_MAP[severity || 'Unknown'] || 0.1;
  
  // Check for event-specific damage boost
  let eventBoost = 0;
  for (const [eventPattern, boost] of Object.entries(EVENT_DAMAGE_BOOST)) {
    if (event.includes(eventPattern)) {
      eventBoost = boost;
      break;
    }
  }
  
  // If event boost found, average it with base severity
  // Otherwise just use base severity
  if (eventBoost > 0) {
    return (baseSeverity + eventBoost) / 2;
  }
  
  return baseSeverity;
}

/**
 * Calculate frequency factor (0-1)
 * More alerts in recent window = higher factor (cumulative damage)
 */
function calculateFrequencyFactor(input: LeadScoringInput): number {
  const { recentAlertCount } = input;
  
  // Map alert count to 0-1 scale
  // 0 alerts = 0.1 (still give some score for the current alert)
  // 1 alert = 0.3
  // 2 alerts = 0.5
  // 3 alerts = 0.7
  // 4+ alerts = 1.0
  
  if (recentAlertCount === 0) return 0.1;
  if (recentAlertCount === 1) return 0.3;
  if (recentAlertCount === 2) return 0.5;
  if (recentAlertCount === 3) return 0.7;
  return 1.0; // 4 or more
}

/**
 * Calculate overlap factor (0-1)
 * Higher confidence when ZIP matches both polygon and city extraction
 */
function calculateOverlapFactor(input: LeadScoringInput): number {
  // If overlap exists, give full confidence (1.0)
  // If not, give partial confidence (0.5) - still valid, just less certain
  return input.hasOverlap ? 1.0 : 0.5;
}

/**
 * Score a lead based on census income and alert characteristics
 * Returns a 0-100 score with detailed breakdown
 */
export function scoreLead(input: LeadScoringInput): LeadScoringOutput {
  // Calculate individual factors (0-1 scale)
  const incomeFactor = calculateIncomeFactor(input);
  const severityFactor = calculateSeverityFactor(input);
  const frequencyFactor = calculateFrequencyFactor(input);
  const overlapFactor = calculateOverlapFactor(input);
  
  // Apply weights
  const weightedIncome = incomeFactor * SCORING_WEIGHTS.income;
  const weightedSeverity = severityFactor * SCORING_WEIGHTS.severity;
  const weightedFrequency = frequencyFactor * SCORING_WEIGHTS.frequency;
  const weightedOverlap = overlapFactor * SCORING_WEIGHTS.overlap;
  
  // Calculate final score (0-1 scale)
  const rawScore = weightedIncome + weightedSeverity + weightedFrequency + weightedOverlap;
  
  // Convert to 0-100 scale and round
  const finalScore = Math.round(Math.min(Math.max(rawScore * 100, 0), 100));
  
  return {
    score: finalScore,
    breakdown: {
      incomeFactor,
      severityFactor,
      frequencyFactor,
      overlapFactor,
      weightedComponents: {
        income: weightedIncome,
        severity: weightedSeverity,
        frequency: weightedFrequency,
        overlap: weightedOverlap,
      },
    },
  };
}

/**
 * Get a human-readable explanation of a lead score
 */
export function explainScore(output: LeadScoringOutput): string[] {
  const { breakdown } = output;
  const explanations: string[] = [];
  
  // Income
  if (breakdown.incomeFactor >= 0.7) {
    explanations.push('Lower income area - high cash buyer potential');
  } else if (breakdown.incomeFactor >= 0.4) {
    explanations.push('Moderate income area');
  } else {
    explanations.push('Higher income area - lower cash buyer potential');
  }
  
  // Severity
  if (breakdown.severityFactor >= 0.7) {
    explanations.push('High severity alert - likely property damage');
  } else if (breakdown.severityFactor >= 0.4) {
    explanations.push('Moderate severity alert');
  } else {
    explanations.push('Lower severity alert');
  }
  
  // Frequency
  if (breakdown.frequencyFactor >= 0.7) {
    explanations.push('Multiple recent alerts - cumulative damage risk');
  } else if (breakdown.frequencyFactor >= 0.4) {
    explanations.push('Some recent alert activity');
  } else {
    explanations.push('First or isolated alert');
  }
  
  // Overlap
  if (breakdown.overlapFactor >= 0.9) {
    explanations.push('High confidence ZIP match (polygon + city)');
  } else {
    explanations.push('Standard confidence ZIP match');
  }
  
  return explanations;
}

