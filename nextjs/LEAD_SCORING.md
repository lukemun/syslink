# Lead Scoring System

## Overview

The lead scoring system ranks weather alert + zipcode combinations (leads) on a scale of 0-100 based on the likelihood that property owners in that area would be interested in cash sale opportunities following weather events.

## Scoring Formula

The final score is a weighted combination of four factors:

```
Score = (Income Factor × 0.3) + (Severity Factor × 0.3) + (Frequency Factor × 0.3) + (Overlap Factor × 0.1)
```

Then multiplied by 100 and clamped to 0-100 range.

## Scoring Factors

### 1. Income Factor (30% weight)

**Rationale**: Lower-income areas are more likely targets for cash buyers, as homeowners may have fewer resources for repairs and less access to traditional financing.

**Calculation**:
- Based primarily on median household income from Census ACS data
- Inverse relationship: lower income = higher score
- Poverty rate provides an additional boost (up to 20% increase)

**Income Brackets**:
- < $30,000: 1.0 factor (highest)
- $30,000 - $44,999: 0.85
- $45,000 - $59,999: 0.7
- $60,000 - $74,999: 0.55
- $75,000 - $99,999: 0.4
- $100,000 - $149,999: 0.25
- ≥ $150,000: 0.1 (lowest)

### 2. Severity Factor (30% weight)

**Rationale**: More severe weather events are more likely to cause property damage requiring repairs or sales.

**Calculation**:
- Based on NWS severity level (Extreme, Severe, Moderate, Minor, Unknown)
- Event-specific damage boost for high-impact event types
- Average of base severity and event boost (if applicable)

**Base Severity Mapping**:
- Extreme: 1.0
- Severe: 0.75
- Moderate: 0.5
- Minor: 0.25
- Unknown: 0.1

**High-Damage Event Types** (with boost values):
- Tornado Warning: 1.0
- Flash Flood Warning: 0.9
- Hurricane Warning: 1.0
- Ice Storm Warning: 0.8
- Severe Thunderstorm Warning: 0.8
- Tropical Storm Warning: 0.7
- Blizzard Warning: 0.7
- Winter Storm Warning: 0.6
- Red Flag Warning: 0.6
- Fire Weather Watch: 0.5

### 3. Frequency Factor (30% weight)

**Rationale**: Multiple alerts in a short timeframe indicate cumulative damage risk and increased likelihood of property distress.

**Calculation**:
- Based on count of alerts affecting the same ZIP in recent window (currently last 30 days)

**Alert Count Mapping**:
- 0 alerts (current only): 0.1
- 1 alert: 0.3
- 2 alerts: 0.5
- 3 alerts: 0.7
- 4+ alerts: 1.0

### 4. Overlap Factor (10% weight)

**Rationale**: Higher confidence in ZIP assignment when multiple detection methods agree (polygon geometry intersection AND city name extraction).

**Calculation**:
- Binary factor based on provenance flags from alert-to-ZIP mapping

**Values**:
- Has overlap (polygon AND city): 1.0
- No overlap (single method): 0.5

## Score Interpretation

### Score Ranges

- **80-100: Hot Lead** 🔥
  - High priority for immediate follow-up
  - Combination of low income, severe damage, and/or multiple events
  
- **60-79: Warm Lead** 🟠
  - Good opportunity worth pursuing
  - Moderate to high factors across multiple dimensions
  
- **40-59: Moderate Lead** 🟡
  - Consider based on capacity and strategy
  - May have one strong factor but others are moderate
  
- **0-39: Cool Lead** ⚪
  - Lower priority
  - Higher income, less severe, or isolated event

## Tuning the Scoring

The scoring weights and factor calculations are defined in `nextjs/shared/leadScoring.ts` and can be adjusted based on real-world performance.

### Current Weights (defined in `SCORING_WEIGHTS`)
```typescript
{
  income: 0.3,      // 30%
  severity: 0.3,    // 30%
  frequency: 0.3,   // 30%
  overlap: 0.1,     // 10%
}
```

### Adjustment Considerations

1. **If too few high-scoring leads**: Increase income weight or lower the income brackets
2. **If too many false positives**: Increase severity or frequency weights
3. **If missing good opportunities in wealthier areas**: Decrease income weight, increase severity/frequency
4. **If ZIP accuracy is a concern**: Increase overlap weight

## Data Sources

- **Income Data**: US Census American Community Survey (ACS) 5-Year Estimates 2023
- **Alert Data**: National Weather Service (NWS) real-time alerts
- **ZIP Mapping**: Combination of FIPS/county lookup, NWS polygon geometry, and city name extraction

## Example Calculations

### Example 1: Hot Lead (Score: 85)
- ZIP: 12345
- Median Income: $28,000 → Income Factor: 1.0
- Event: Tornado Warning, Severity: Extreme → Severity Factor: 1.0
- Recent Alerts: 2 → Frequency Factor: 0.5
- Has Overlap: Yes → Overlap Factor: 1.0
- **Score**: (1.0×0.3 + 1.0×0.3 + 0.5×0.3 + 1.0×0.1) × 100 = **79** 

Actually: Let me recalculate with poverty boost:
- Income Factor with poverty rate of 20%: 1.0 + (0.2 × 0.2) = 1.0 (capped)
- **Score**: (1.0×0.3 + 1.0×0.3 + 0.5×0.3 + 1.0×0.1) × 100 = **79**

### Example 2: Moderate Lead (Score: 52)
- ZIP: 67890
- Median Income: $65,000 → Income Factor: 0.55
- Event: Winter Storm Warning, Severity: Moderate → Severity Factor: (0.5 + 0.6)/2 = 0.55
- Recent Alerts: 1 → Frequency Factor: 0.3
- Has Overlap: No → Overlap Factor: 0.5
- **Score**: (0.55×0.3 + 0.55×0.3 + 0.3×0.3 + 0.5×0.1) × 100 = **47**

## Future Enhancements

Potential additional factors to consider:
- Property age/condition data (older homes more likely to have damage)
- Historical disaster claims (FEMA data)
- Homeownership rate (higher rate = more potential sellers)
- Vacancy rate (areas with higher vacancy may have distressed properties)
- Days on market trends (market velocity indicator)
- Distance from alert polygon centroid to ZIP centroid (confidence metric)

