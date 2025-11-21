-- Validation queries for ZIP provenance flags in weather_alert_zipcodes
-- Run these queries after initial deployment to verify expected distributions

-- 1. Basic counts: total alerts and total ZIP mappings
SELECT 
  (SELECT COUNT(DISTINCT id) FROM weather_alerts) as total_alerts,
  (SELECT COUNT(*) FROM weather_alert_zipcodes) as total_zip_mappings,
  (SELECT COUNT(DISTINCT zipcode) FROM weather_alert_zipcodes) as unique_zipcodes;

-- 2. Distribution of flags across all ZIP mappings
SELECT 
  COUNT(*) FILTER (WHERE from_county) as county_count,
  COUNT(*) FILTER (WHERE from_polygon) as polygon_count,
  COUNT(*) FILTER (WHERE from_city) as city_count,
  COUNT(*) FILTER (WHERE from_county AND from_polygon) as county_polygon_count,
  COUNT(*) FILTER (WHERE from_polygon AND from_city) as polygon_city_intersection,
  COUNT(*) FILTER (WHERE from_county AND from_polygon AND from_city) as all_three_count,
  COUNT(*) FILTER (WHERE NOT from_county AND NOT from_polygon AND NOT from_city) as no_flags_count,
  COUNT(*) as total_mappings
FROM weather_alert_zipcodes;

-- 3. Per-alert statistics (sample of recent alerts)
SELECT 
  waz.alert_id,
  wa.event,
  wa.severity,
  COUNT(*) as total_zips,
  COUNT(*) FILTER (WHERE waz.from_county) as county_zips,
  COUNT(*) FILTER (WHERE waz.from_polygon) as polygon_zips,
  COUNT(*) FILTER (WHERE waz.from_city) as city_zips,
  COUNT(*) FILTER (WHERE waz.from_polygon AND waz.from_city) as intersection_zips,
  ROUND(100.0 * COUNT(*) FILTER (WHERE waz.from_polygon) / NULLIF(COUNT(*) FILTER (WHERE waz.from_county), 0), 1) as polygon_pct_of_county,
  ROUND(100.0 * COUNT(*) FILTER (WHERE waz.from_city) / NULLIF(COUNT(*) FILTER (WHERE waz.from_county), 0), 1) as city_pct_of_county
FROM weather_alert_zipcodes waz
JOIN weather_alerts wa ON waz.alert_id = wa.id
WHERE wa.effective > NOW() - INTERVAL '24 hours'
GROUP BY waz.alert_id, wa.event, wa.severity
ORDER BY wa.effective DESC
LIMIT 20;

-- 4. Verify no orphaned flags (all ZIPs should have at least one flag TRUE)
SELECT COUNT(*) as orphaned_count
FROM weather_alert_zipcodes
WHERE NOT from_county AND NOT from_polygon AND NOT from_city;
-- Expected: 0 (no orphans)

-- 5. Distribution of strategy combinations
SELECT 
  from_county,
  from_polygon,
  from_city,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM weather_alert_zipcodes
GROUP BY from_county, from_polygon, from_city
ORDER BY count DESC;

-- 6. Alerts with city matches (city flag = TRUE for at least one ZIP)
SELECT 
  COUNT(DISTINCT alert_id) as alerts_with_city_matches,
  (SELECT COUNT(DISTINCT id) FROM weather_alerts WHERE effective > NOW() - INTERVAL '24 hours') as total_recent_alerts,
  ROUND(100.0 * COUNT(DISTINCT alert_id) / (SELECT COUNT(DISTINCT id) FROM weather_alerts WHERE effective > NOW() - INTERVAL '24 hours'), 1) as pct_with_cities
FROM weather_alert_zipcodes
WHERE from_city = TRUE
  AND alert_id IN (SELECT id FROM weather_alerts WHERE effective > NOW() - INTERVAL '24 hours');

-- 7. Average ZIP counts per alert by strategy
SELECT 
  AVG(county_count) as avg_county_zips,
  AVG(polygon_count) as avg_polygon_zips,
  AVG(city_count) as avg_city_zips,
  AVG(intersection_count) as avg_intersection_zips
FROM (
  SELECT 
    alert_id,
    COUNT(*) FILTER (WHERE from_county) as county_count,
    COUNT(*) FILTER (WHERE from_polygon) as polygon_count,
    COUNT(*) FILTER (WHERE from_city) as city_count,
    COUNT(*) FILTER (WHERE from_polygon AND from_city) as intersection_count
  FROM weather_alert_zipcodes
  GROUP BY alert_id
) stats;

-- 8. Sample ZIPs with multiple flags for manual spot-check
SELECT 
  waz.alert_id,
  wa.event,
  wa.area_desc,
  waz.zipcode,
  waz.from_county,
  waz.from_polygon,
  waz.from_city
FROM weather_alert_zipcodes waz
JOIN weather_alerts wa ON waz.alert_id = wa.id
WHERE (waz.from_county::int + waz.from_polygon::int + waz.from_city::int) >= 2
  AND wa.effective > NOW() - INTERVAL '24 hours'
ORDER BY RANDOM()
LIMIT 10;

-- 9. Polygon filtering effectiveness (reduction from county baseline)
SELECT 
  wa.event,
  COUNT(DISTINCT waz.alert_id) as alert_count,
  AVG(county_count) as avg_county_zips,
  AVG(polygon_count) as avg_polygon_zips,
  ROUND(100.0 * AVG(polygon_count) / NULLIF(AVG(county_count), 0), 1) as avg_polygon_pct_of_county
FROM weather_alert_zipcodes waz
JOIN weather_alerts wa ON waz.alert_id = wa.id
JOIN (
  SELECT 
    alert_id,
    COUNT(*) FILTER (WHERE from_county) as county_count,
    COUNT(*) FILTER (WHERE from_polygon) as polygon_count
  FROM weather_alert_zipcodes
  GROUP BY alert_id
) stats ON waz.alert_id = stats.alert_id
WHERE wa.effective > NOW() - INTERVAL '24 hours'
GROUP BY wa.event
ORDER BY alert_count DESC;

-- 10. Check index usage (run EXPLAIN on common queries to verify indexes are used)
EXPLAIN ANALYZE
SELECT zipcode 
FROM weather_alert_zipcodes 
WHERE from_polygon = TRUE
LIMIT 100;

EXPLAIN ANALYZE
SELECT zipcode 
FROM weather_alert_zipcodes 
WHERE from_polygon = TRUE AND from_city = TRUE
LIMIT 100;



