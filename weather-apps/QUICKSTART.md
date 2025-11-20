# Weather Crawler - Quick Start

## Prerequisites

Ensure the root `.env` file exists with:

```bash
# /Users/lukemunro/Clones/syslink/.env

AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
DATABASE_URL=postgresql://user:pass@host:port/db
```

## Deploy in 3 Steps

### 1. Navigate to directory

```bash
cd /Users/lukemunro/Clones/syslink/weather-crawler
```

### 2. Use the deployment script

```bash
# Deploy to dev
./deploy.sh

# OR deploy to production
./deploy.sh production
```

### 3. Verify deployment

```bash
# View logs
npx sst logs --stage dev

# Or manually invoke
aws lambda invoke \
  --function-name weather-crawler-dev-WeatherCrawlerStack-WeatherCrawlerCron \
  --payload '{}' \
  response.json && cat response.json
```

## What Happens Next?

The Lambda function will run automatically **every hour** and:

1. Fetch active NWS alerts
2. Filter by severity, certainty, and event type
3. Insert/update alerts in `weather_alerts` table
4. Map alerts to ZIP codes in `weather_alert_zipcodes` table

## Check the Database

```sql
-- View recent alerts
SELECT id, event, severity, effective, is_damaged
FROM weather_alerts
ORDER BY effective DESC
LIMIT 10;

-- View ZIP code mappings
SELECT a.event, a.severity, z.zipcode
FROM weather_alerts a
JOIN weather_alert_zipcodes z ON a.id = z.alert_id
WHERE a.effective > NOW() - INTERVAL '1 day'
LIMIT 20;
```

## Troubleshooting

**Deployment fails?**
- Check AWS credentials are set in `.env`
- Verify DATABASE_URL is correct
- Ensure you have IAM permissions to create Lambda functions

**Lambda fails?**
- Check CloudWatch Logs: `npx sst logs`
- Verify database is accessible from AWS
- Check that lookup files exist in `src/data/processed/`

**No alerts in database?**
- Check if there are active alerts: https://api.weather.gov/alerts/active
- Review Lambda logs for filtering details
- Verify filters in `src/config.ts` aren't too restrictive

## Next Steps

- Read `README.md` for architecture overview
- Read `DEPLOYMENT.md` for detailed deployment guide
- Read `IMPLEMENTATION_SUMMARY.md` for design decisions
- Monitor CloudWatch Logs for the first few runs
- Query the database to verify data is flowing

## Remove the Stack

```bash
npx sst remove --stage dev
```

This removes all AWS resources but keeps your database data intact.

