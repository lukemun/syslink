# Deployment Checklist

Use this checklist to verify the SST Ion migration deployment.

## Pre-Deployment

- [ ] `.env` file exists in parent directory with `DATABASE_URL` set
- [ ] AWS credentials are configured (`aws configure` or environment variables)
- [ ] SST version is 3.17.23 or higher (`npm list sst`)
- [ ] Dependencies are up to date (`npm install` in `weather-crawler/`)

## Initial Deployment (Dev Stage)

- [ ] Run `cd weather-crawler && npx sst deploy --stage dev`
- [ ] Deployment completes without errors
- [ ] `.sst/platform/config.d.ts` is generated
- [ ] TypeScript errors in `sst.config.ts` are resolved (re-check with editor)
- [ ] Stack outputs show `weatherCrawlerCronName`

## AWS Resource Verification

- [ ] Lambda function exists in AWS Console:
  - Function name: `weather-crawler-dev-WeatherCrawlerCron`
  - Runtime: Node.js (latest version SST uses)
  - Memory: 512 MB
  - Timeout: 5 minutes
  
- [ ] Environment variables set on Lambda:
  - [ ] `DATABASE_URL` is present and correct
  
- [ ] EventBridge rule exists:
  - Rule name matches the Cron resource
  - Schedule expression: `rate(1 hour)`
  - Target is the Lambda function
  
- [ ] IAM role has appropriate permissions:
  - CloudWatch Logs write access
  - Lambda execution permissions

## Functional Testing

- [ ] Manual invocation test:
  ```bash
  aws lambda invoke \
    --function-name weather-crawler-dev-WeatherCrawlerCron \
    --log-type Tail \
    output.json && cat output.json
  ```

- [ ] Response status code is 200
- [ ] Response body shows successful alert processing or "No active alerts"
- [ ] No errors in response body

- [ ] Check CloudWatch Logs:
  ```bash
  aws logs tail /aws/lambda/weather-crawler-dev-WeatherCrawlerCron --follow
  ```

- [ ] Logs show:
  - [ ] "Weather Crawler Lambda Started"
  - [ ] "Step 1: Fetching active alerts"
  - [ ] "Step 2: Ingesting alerts into database" (if alerts exist)
  - [ ] "Weather Crawler Lambda Completed Successfully"

- [ ] Database verification:
  - [ ] New/updated records appear in `weather_alerts` table
  - [ ] ZIP code mappings appear in `weather_alert_zipcodes` table (if alerts exist)

## Wait for Scheduled Execution

- [ ] Wait 1+ hour for EventBridge to trigger the Cron
- [ ] Check CloudWatch Logs for automatic execution
- [ ] Verify database was updated by the scheduled run

## Production Deployment (Optional)

- [ ] Set production secrets if needed:
  ```bash
  sst secret set DATABASE_URL "postgresql://..." --stage production
  ```

- [ ] Deploy to production:
  ```bash
  npx sst deploy --stage production
  ```

- [ ] Repeat AWS Resource Verification for `weather-crawler-production-*` resources
- [ ] Repeat Functional Testing for production stage
- [ ] Monitor production CloudWatch Logs for first few automatic executions

## Cleanup (After Successful Verification)

- [ ] Old SST v2 stack files archived in `stacks/archive/`
- [ ] Old `.sst/` directory removed (if present from v2)
- [ ] `ION_MIGRATION.md` reviewed and understood
- [ ] `README.md` updated with Ion references
- [ ] Team notified of migration completion

## Rollback Plan (If Issues Occur)

If the Ion deployment has issues:

1. **Restore SST v2 config**:
   ```bash
   git checkout HEAD~1 -- sst.config.ts
   cp stacks/archive/WeatherCrawlerStack.ts stacks/
   ```

2. **Redeploy SST v2**:
   ```bash
   npx sst deploy --stage dev
   ```

3. **Document issues** and troubleshoot before attempting Ion migration again

## Notes

- TypeScript linter errors before first deployment are expected and will resolve after `.sst/platform/config.d.ts` is generated
- Database connection issues often indicate security group/network configuration rather than SST issues
- Consult `ION_MIGRATION.md` for detailed troubleshooting steps


