# Weather Crawler - Implementation Summary

## What Was Built

A serverless AWS Lambda function using SST (Serverless Stack) that runs every hour to:

1. Fetch active weather alerts from the National Weather Service API
2. Filter alerts by severity, certainty, and event type
3. Evaluate each alert for property damage relevance
4. Insert/update alerts in the `weather_alerts` Postgres table
5. Enrich alerts with ZIP code mappings in the `weather_alert_zipcodes` table

## Key Features

### Automatic Scheduling
- **Trigger**: EventBridge (CloudWatch Events) Cron
- **Frequency**: Every hour (`rate(1 hour)`)
- **Runtime**: Node.js with TypeScript
- **Timeout**: 5 minutes
- **Memory**: 512 MB

### Alert Processing Pipeline

1. **Fetch Module** (`src/fetch.ts`)
   - Queries NWS `/alerts/active` API
   - Applies server-side status filter (`actual` only)
   - Applies client-side filters for severity, certainty, and event types
   - Returns filtered GeoJSON data

2. **Ingest Module** (`src/ingest.ts`)
   - Transforms alert features to database rows
   - Evaluates damage relevance using:
     - Severity/certainty thresholds
     - Event type matching
     - Keyword matching from CSV file
   - Upserts alerts to database
   - Enriches with ZIP code mappings

3. **Database Module** (`src/db.ts`)
   - Connection pooling for Postgres
   - Typed interfaces for alert data
   - Batch upsert operations
   - Relationship management (alerts ↔ zipcodes)

4. **Utilities** (`src/utils/alert-to-zips.ts`)
   - SAME (FIPS) code to ZIP code translation
   - County information lookup
   - Polygon geometry filtering
   - Residential ratio thresholds

### Configuration System

**Alert Filters** (`src/config.ts`):
- Centralized configuration for what alerts to process
- Easily adjustable severity/certainty thresholds
- Damage event type lists (used vs. possible)

**Damage Keywords** (`src/weather_damage_triggers_extended.csv`):
- 22 trigger patterns for damage assessment
- Keyword matching against alert text
- Quantitative thresholds and severity levels

### Data Dependencies

**Lookup Tables** (copied to `src/data/processed/`):
- `fips-to-county.json` - County metadata by FIPS code
- `fips-to-zips.json` - ZIP codes within each county
- `zip-to-fips.json` - Reverse lookup
- `zip-centroids.json` - Geographic coordinates for polygon filtering

These files enable accurate ZIP code mapping from NWS SAME codes.

## File Structure

```
weather-crawler/
├── packages/functions/src/
│   ├── index.ts                   # Lambda handler entry point
│   ├── config.ts                  # Alert filtering configuration
│   ├── db.ts                      # Database operations
│   ├── fetch.ts                   # NWS API client
│   ├── ingest.ts                  # Alert processing logic
│   ├── weather_damage_triggers_extended.csv
│   ├── data/processed/            # FIPS/ZIP lookup tables
│   └── utils/
│       └── alert-to-zips.ts       # Geographic utilities
├── stacks/
│   └── WeatherCrawlerStack.ts     # SST infrastructure definition
├── sst.config.ts                  # SST configuration
├── deploy.sh                      # Deployment helper script
├── README.md                      # Usage documentation
├── DEPLOYMENT.md                  # Deployment guide
└── IMPLEMENTATION_SUMMARY.md      # This file
```

## Design Decisions

### Why Copy Instead of Import?

Per project requirements, all logic was copied from `weather-alerts/` instead of importing. This creates:
- **Isolation**: Lambda bundle is self-contained
- **Independence**: Changes to weather-alerts scripts don't break production Lambda
- **Simplicity**: No shared package dependencies or monorepo complexity

### Why SST Over Serverless Framework?

- **Modern DX**: Better TypeScript support and local development
- **Infrastructure as Code**: CDK-based, more flexible than YAML
- **Built-in Features**: Cron constructs, environment variable binding, secrets management

### Why Hourly Schedule?

Balance between:
- **Freshness**: Alerts update frequently, hourly catches most changes
- **Cost**: Within AWS free tier (1M Lambda invocations/month)
- **API Respect**: Avoids overwhelming NWS API

### Why 512 MB Memory?

- Alert processing involves JSON parsing and database operations
- 512 MB provides headroom without excessive cost
- Lambda pricing scales with memory, but difference is minimal at this tier

## Environment Requirements

The Lambda function requires:

1. **DATABASE_URL** - Postgres connection string
   - Set via environment variable in SST config
   - Loaded from root `.env` during deployment

2. **AWS Credentials** - For deployment only
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - Set in root `.env` file

## Database Schema

Expected tables (created via migrations in `../supabase/migrations/`):

### `weather_alerts`
- Stores alert metadata and full GeoJSON
- Primary key: `id` (NWS alert ID)
- Includes: event type, severity, timestamps, damage flag, raw JSON

### `weather_alert_zipcodes`
- Maps alerts to affected ZIP codes
- Composite key: `(alert_id, zipcode)`
- Enables querying alerts by location

## Deployment Process

1. Load environment variables from root `.env`
2. Run `npx sst deploy --stage {stage}`
3. SST synthesizes CloudFormation stack
4. Creates Lambda function, EventBridge rule, IAM roles, CloudWatch log group
5. Outputs Cron job name and any endpoints

See `DEPLOYMENT.md` for detailed instructions.

## Testing Strategy

### Local Testing
- Run functions individually during development
- Use `sst bind` to simulate AWS environment
- Test database connections with local .env

### Production Monitoring
- CloudWatch Logs for execution traces
- Database queries to verify data ingestion
- CloudWatch Alarms for failure notifications (optional)

### Manual Invocation
```bash
aws lambda invoke \
  --function-name {function-name} \
  --payload '{}' \
  response.json
```

## Known Limitations

1. **No Retry Logic**: Failed alerts are skipped, not retried
   - Consider: DLQ (Dead Letter Queue) for failed events

2. **No Deduplication**: Relies on database UPSERT for idempotency
   - Safe for hourly runs but not for higher frequencies

3. **Fixed Schedule**: Cannot dynamically adjust based on alert volume
   - Could add: Event-driven triggers from SNS/SQS

4. **ZIP Code Precision**: Depends on pre-built lookup tables
   - Marine/offshore zones often lack ZIP mappings
   - Polygon filtering helps but isn't perfect

5. **No Alert Expiration Cleanup**: Old alerts remain in database
   - Consider: Scheduled job to archive expired alerts

## Future Enhancements

### Near-term (Low Effort)
- [ ] Add CloudWatch Alarms for Lambda failures
- [ ] Implement SNS notifications for high-severity alerts
- [ ] Add metrics/counters for enrichment success rate
- [ ] Create dashboard in CloudWatch/Grafana

### Mid-term (Medium Effort)
- [ ] Add DLQ and retry logic for failed enrichments
- [ ] Implement alert expiration cleanup job
- [ ] Add API endpoint to trigger manual crawl
- [ ] Support multi-region deployment

### Long-term (High Effort)
- [ ] Event-driven architecture (SQS → Lambda)
- [ ] Real-time alert streaming via WebSocket
- [ ] Machine learning for damage prediction
- [ ] Integration with property databases (parcel data)

## Success Metrics

How to measure if this is working:

1. **Lambda Invocations**: ~720/month (24 hours × 30 days)
2. **Success Rate**: > 95% of invocations succeed
3. **Alert Count**: Varies by season/geography (typically 50-500/hour nationally)
4. **Enrichment Rate**: > 80% of alerts mapped to ZIP codes
5. **Execution Time**: < 2 minutes per invocation
6. **Cost**: < $1/month within free tier

## Maintenance

### Regular Tasks
- Monitor CloudWatch Logs weekly
- Check database growth monthly
- Review failure reasons quarterly
- Update damage event config as needed

### When NWS API Changes
- Update `src/fetch.ts` if endpoint schema changes
- Regenerate lookup tables if FIPS codes change
- Test thoroughly in staging before production deploy

### When Requirements Change
- Adjust filters in `src/config.ts`
- Modify schedule in `stacks/WeatherCrawlerStack.ts`
- Update damage keywords CSV as needed
- Redeploy with `./deploy.sh production`

## Related Documentation

- `README.md` - Quick start and usage
- `DEPLOYMENT.md` - Step-by-step deployment guide
- `../weather-alerts/README.md` - Original scripts documentation
- `../supabase/migrations/` - Database schema

## Questions or Issues?

Contact the development team or refer to:
- SST Documentation: https://sst.dev/docs
- NWS API Docs: https://www.weather.gov/documentation/services-web-api
- Supabase Docs: https://supabase.com/docs

