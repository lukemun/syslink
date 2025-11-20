# Weather Apps

A unified SST-based infrastructure project that manages weather-related applications and services.

## Overview

This project consolidates weather-related backend infrastructure into a single SST Ion configuration:

1. **Weather Crawler** - Hourly Cron job that fetches NWS alerts and ingests them into Postgres
2. **Shared Utilities** - Common database access functions and utilities
3. **Scripts** - CLI tools for data processing and analysis

> **Note**: The Alerts Dashboard has been extracted to a standalone Next.js project at `/nextjs` in the repository root.

## Architecture

- **Framework**: SST Ion (Pulumi-based)
- **Runtime**: Node.js with TypeScript
- **Infrastructure**: AWS (Lambda, EventBridge)
- **Database**: Postgres/Supabase

> **Note**: This project was restructured from separate `weather-crawler` and `weather-alerts` directories into a unified monorepo structure. The `alerts-dashboard` has been extracted to `/nextjs` as a standalone Next.js project.

## Directory Structure

```
weather-apps/
├── apps/
│   └── crawler/                      # Weather alert crawler Lambda
│       └── src/
│           ├── config.ts             # Alert filtering configuration
│           ├── db.ts                 # Database utilities
│           ├── fetch.ts              # NWS API fetching logic
│           ├── ingest.ts             # Alert ingestion logic
│           ├── index.ts              # Lambda handler
│           ├── data/processed/       # FIPS/ZIP lookup tables
│           └── utils/                # Utility functions
├── packages/
│   └── shared/                       # Shared database utilities
│       └── alertsDb.ts               # Common alert queries
├── scripts/                          # CLI tools and data processing
│   ├── data/                         # Raw and processed data files
│   └── *.{js,ts}                     # Various scripts
├── stacks/                           # SST stack definitions (optional)
└── sst.config.ts                     # SST Ion configuration
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
cd weather-apps
npm install
```

### Local Development

Start the SST dev environment (runs all apps):

```bash
npm run dev
```

This will start:
- Weather crawler in dev mode (responds to test events)
- Alerts dashboard at `http://localhost:3000`

### Deploy

Deploy all apps to AWS (using SST Ion):

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

Required in parent `.env` file:

**Crawler:**
- `DATABASE_URL` - Postgres connection string
- `DEBUG_DAMAGE` (optional) - Set to `1` for verbose damage evaluation logs

**Dashboard** (now in `/nextjs` - see that directory for details):
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Supabase publishable key

## Configuration

### Alert Filtering

Edit `apps/crawler/src/config.ts` to customize:

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

## Related Documentation

- `../nextjs/` - **Standalone Next.js alerts dashboard** (extracted from this monorepo)
- `apps/crawler/` - Weather crawler Lambda function
- `scripts/` - CLI tools and data processing scripts (formerly weather-alerts/)
- `packages/shared/` - Shared database utilities
- `../supabase/migrations/` - Database schema migrations
- `../.env` - Root environment variables (AWS credentials, DATABASE_URL)

## License

Internal project for Syslink.

