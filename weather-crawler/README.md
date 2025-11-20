# Weather Crawler

An SST-based serverless application that automatically fetches active National Weather Service (NWS) alerts and ingests them into a Postgres database on an hourly schedule.

## Overview

This Lambda function runs every hour via EventBridge (CloudWatch Events) to:

1. Fetch active weather alerts from the NWS API
2. Filter alerts by severity, certainty, and event type
3. Evaluate each alert for property damage relevance
4. Upsert alerts into the `weather_alerts` table
5. Enrich alerts with ZIP code mappings in the `weather_alert_zipcodes` table

## Architecture

- **Framework**: SST Ion (Pulumi-based)
- **Runtime**: Node.js with TypeScript
- **Trigger**: Cron (hourly via EventBridge)
- **Database**: Postgres/Supabase

> **Note**: This project was migrated from SST v2 to SST Ion. See `ION_MIGRATION.md` for migration details.

## Directory Structure

```
weather-crawler/
├── packages/
│   └── functions/
│       └── src/
│           ├── config.ts              # Alert filtering configuration
│           ├── db.ts                  # Database utilities
│           ├── fetch.ts               # NWS API fetching logic
│           ├── ingest.ts              # Alert ingestion logic
│           ├── index.ts               # Lambda handler
│           ├── weather_damage_triggers_extended.csv
│           ├── data/
│           │   └── processed/         # FIPS/ZIP lookup tables
│           └── utils/
│               └── alert-to-zips.ts   # ZIP code mapping utilities
├── stacks/
│   └── archive/                      # Old SST v2 stacks (archived)
└── sst.config.ts                      # SST Ion configuration
```

## Prerequisites

1. **AWS Credentials**: Set up in root `.env` file:
   ```
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   ```

2. **Database URL**: Set in root `.env` file:
   ```
   DATABASE_URL=postgresql://user:password@host:port/database
   ```

3. **Database Tables**: Ensure the following tables exist:
   - `weather_alerts` - Stores alert metadata
   - `weather_alert_zipcodes` - Maps alerts to ZIP codes

   See `supabase/migrations/` in the parent directory for schema.

## Development

### Install Dependencies

```bash
cd weather-crawler
npm install
```

### Local Development

Start the SST dev environment:

```bash
npm run dev
```

### Deploy

Deploy to AWS (using SST Ion):

```bash
# Deploy to dev stage (default)
npm run deploy
# or
npx sst deploy --stage dev

# Deploy to production
npx sst deploy --stage production
```

> **Important**: The first deployment will generate `.sst/platform/config.d.ts` and resolve TypeScript errors. See `ION_MIGRATION.md` for detailed deployment instructions.

### Environment Variables

The Lambda function requires:

- `DATABASE_URL` - Postgres connection string (set in SST config from process.env)
- `DEBUG_DAMAGE` (optional) - Set to `1` for verbose damage evaluation logs

## Configuration

### Alert Filtering

Edit `packages/functions/src/config.ts` to customize:

- **USED_FILTERS**: Controls which alerts are fetched and processed
  - `api.status`: API-level filters (e.g., `['actual']`)
  - `client.severity`: Severity threshold (e.g., `['extreme', 'severe']`)
  - `client.certainty`: Certainty threshold (e.g., `['observed', 'likely']`)

- **DAMAGE_EVENT_CONFIG**: Lists NWS event types considered damage-relevant
  - `primaryUsed`: Event types currently used for filtering
  - `primaryPossible`: Additional event types available for future use

### Schedule

Edit `sst.config.ts` to change the schedule (in the `run()` function):

```typescript
schedule: "rate(1 hour)"  // Run every hour
// or
schedule: "cron(0 * * * ? *)"  // Cron expression format
```

## How It Works

1. **Fetch**: Queries the NWS `/alerts/active` API endpoint
   - Applies server-side status filter (`actual` only)
   - Applies client-side severity, certainty, and event type filters

2. **Evaluate Damage**: For each alert:
   - Checks severity, certainty, and event type against config
   - Matches keywords from `weather_damage_triggers_extended.csv` against alert text
   - Marks as `is_damaged` if all criteria are met

3. **Upsert Alerts**: Inserts or updates records in `weather_alerts` table

4. **Enrich with ZIP Codes**:
   - Extracts SAME (FIPS) codes from each alert
   - Maps FIPS codes to ZIP codes using pre-built lookup tables
   - Optionally filters by residential ratio and polygon geometry
   - Inserts mappings into `weather_alert_zipcodes` table

## Monitoring

CloudWatch Logs are automatically created for the Lambda function. View logs:

```bash
npx sst logs --stage production
```

## Troubleshooting

### Missing ZIP Mappings

If alerts are skipped during enrichment:
- Check that SAME codes are present in the alert
- Verify lookup tables exist in `data/processed/`
- Review failure reasons in Lambda logs

### Database Connection Issues

- Ensure `DATABASE_URL` is correctly set
- Verify database is accessible from AWS Lambda (check security groups/VPC)
- Check Supabase connection limits

### API Rate Limiting

The NWS API has usage limits. If you encounter 403 errors:
- Verify the User-Agent header is set correctly
- Consider implementing exponential backoff

## Related Files

- `../weather-alerts/` - Original Node.js scripts (development/testing)
- `../supabase/migrations/` - Database schema migrations
- `../.env` - Root environment variables (AWS credentials, DATABASE_URL)

## License

Internal project for Syslink.

