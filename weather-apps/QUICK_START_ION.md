# Quick Start: SST Ion Deployment

## TL;DR

Your weather-crawler has been migrated to SST Ion. Here's how to deploy:

```bash
cd weather-crawler

# Make sure DATABASE_URL is set in ../.env
# DATABASE_URL=postgresql://user:password@host:port/database

# Deploy to dev stage
npx sst deploy --stage dev

# Test manually
aws lambda invoke \
  --function-name weather-crawler-dev-WeatherCrawlerCron \
  --log-type Tail \
  output.json && cat output.json

# Check logs
aws logs tail /aws/lambda/weather-crawler-dev-WeatherCrawlerCron --follow

# Deploy to production when ready
npx sst deploy --stage production
```

## What Changed

- **Config**: `sst.config.ts` now uses Ion `$config()` style (Pulumi-based)
- **Stacks**: Old SST v2 stack files moved to `stacks/archive/`
- **Lambda Code**: ✅ No changes - same handler, same logic
- **Resources**: ✅ Same Cron schedule, memory, timeout, environment vars

## Deployment Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Local development with hot reload |
| `npm run deploy` | Deploy to dev stage |
| `npx sst deploy --stage <name>` | Deploy to specific stage |
| `npx sst remove --stage <name>` | Remove deployed resources |
| `sst secret set KEY value --stage <name>` | Set production secrets |

## First Deployment

The first deployment will:
1. Generate `.sst/platform/config.d.ts` (TypeScript definitions)
2. Create Lambda function: `weather-crawler-<stage>-WeatherCrawlerCron`
3. Create EventBridge rule for hourly execution
4. Set up CloudWatch Logs
5. Configure IAM roles

TypeScript errors in `sst.config.ts` will auto-resolve after step 1.

## Verification Checklist

After deployment, verify:

- [ ] Lambda function exists in AWS Console
- [ ] Environment variable `DATABASE_URL` is set
- [ ] EventBridge rule shows `rate(1 hour)` schedule
- [ ] Manual invocation succeeds (see command above)
- [ ] CloudWatch Logs show successful execution
- [ ] Database tables (`weather_alerts`, `weather_alert_zipcodes`) receive data

## Troubleshooting

| Issue | Solution |
|-------|----------|
| TypeScript errors in `sst.config.ts` | Normal before first deploy - will resolve automatically |
| Database connection errors | Check `DATABASE_URL` in `.env` and database network access |
| Permission errors | Verify AWS credentials with `aws sts get-caller-identity` |
| Lambda not found | Check stage name matches (dev vs production) |

## Documentation

- **Full migration details**: See `ION_MIGRATION.md`
- **Step-by-step checklist**: See `DEPLOYMENT_CHECKLIST.md`
- **Migration summary**: See `MIGRATION_SUMMARY.md`
- **General usage**: See `README.md`

## Rollback

If needed, restore SST v2:

```bash
git checkout HEAD~1 -- sst.config.ts
cp stacks/archive/WeatherCrawlerStack.ts stacks/
npx sst deploy --stage dev
```

## Database Connection

**Recommended**: Use Supabase's **pooled connection string** for Lambda:

```bash
# Pooled (recommended for Lambda)
DATABASE_URL=postgresql://postgres.xxx:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres

# Direct (also works, but can exhaust connections)
DATABASE_URL=postgresql://postgres.xxx:[PASSWORD]@aws-0-[region].supabase.com:5432/postgres
```

## Environment Variables

Required environment variables:

- `DATABASE_URL` - Postgres connection string (required)
- `DEBUG_DAMAGE` - Optional, set to `1` for verbose damage evaluation logs

Set in `../.env` for local/dev, or use `sst secret set` for production.

## Next Steps

1. Deploy to dev: `npx sst deploy --stage dev`
2. Verify with checklist: `DEPLOYMENT_CHECKLIST.md`
3. Monitor first few hourly runs in CloudWatch Logs
4. Deploy to production when stable
5. Archive old `.sst/` directory if present from SST v2

---

**Need help?** See full migration guide in `ION_MIGRATION.md`

