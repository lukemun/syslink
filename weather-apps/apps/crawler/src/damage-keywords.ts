/**
 * Weather damage trigger keywords extracted from weather_damage_triggers_extended.csv
 * 
 * Purpose:
 * - Contains keywords used to identify damage-relevant weather alerts
 * - Used by ingest.ts to evaluate if an alert is likely to cause property damage
 * 
 * Usage:
 *   import { DAMAGE_KEYWORDS } from './damage-keywords.js';
 * 
 * Note:
 * - Generated from weather_damage_triggers_extended.csv
 * - To regenerate, run: node convert-csv-to-ts.cjs
 */

export const DAMAGE_KEYWORDS: string[] = [
  "1\"\" hail",
  "2\"\" hail",
  "aftershock",
  "air quality alert from wildfire",
  "blizzard warning",
  "brush fire",
  "building fire",
  "coastal flood warning",
  "coastal inundation",
  "confirmed tornado",
  "damaging winds",
  "debris flow",
  "debris signature",
  "derecho",
  "destructive winds",
  "downburst",
  "earthquake",
  "extreme fire danger",
  "fema disaster declaration",
  "flash flood warning",
  "flood warning",
  "forest fire",
  "freezing rain accumulation",
  "golf‑ball size hail",
  "hard freeze warning",
  "heavy snow + strong winds",
  "house fire",
  "hurricane warning",
  "ia approved",
  "ice storm warning",
  "individual assistance",
  "landslide",
  "life‑threatening flash flooding",
  "lightning strike to structure",
  "lightning‑caused fire",
  "major flooding",
  "major hurricane",
  "major winter storm",
  "microburst",
  "moderate flooding",
  "mudslide",
  "multiple warnings",
  "overwash",
  "prolonged subfreezing temps",
  "radar‑indicated rotation",
  "red flag warning",
  "residential structure fire",
  "severe hail",
  "severe thunderstorm warning",
  "severe weather outbreak",
  "shaking reported",
  "significant icing",
  "slope failure",
  "storm surge",
  "straight-line winds",
  "street flooding",
  "structure threat",
  "tornado warning",
  "tropical cyclone",
  "tropical depression heavy rain",
  "tropical storm force",
  "tropical storm warning",
  "typhoon warning",
  "urban flooding",
  "water over roadways",
  "water rescues",
  "wildfire"
];
