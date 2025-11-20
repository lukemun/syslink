# Weather Crawler Deployment Guide

## Prerequisites

Before deploying, ensure you have:

1. AWS credentials configured
2. Database URL for Postgres/Supabase
3. SST CLI installed (via npm in this project)

## Step 1: Configure Environment Variables

The deployment uses environment variables from the root `.env` file. Ensure these are set:

```bash
# In /Users/lukemunro/Clones/syslink/.env

# AWS Credentials
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1

# Database Connection
DATABASE_URL=postgresql://user:password@host:port/database
```

## Step 2: Source Environment Variables

Before deploying, load the environment variables:

```bash
# From the weather-crawler directory
cd /Users/lukemunro/Clones/syslink/weather-crawler

# Source the parent .env file
export $(grep -v '^#' ../.env | xargs)
```

Or use a tool like `dotenv`:

```bash
npx dotenv -e ../.env -- npx sst deploy
```

## Step 3: Deploy to AWS

### Deploy to Development (Default)

```bash
npx sst deploy
```

This creates a stack named `weather-crawler-dev` in your AWS account.

### Deploy to Production

```bash
npx sst deploy --stage production
```

This creates a stack named `weather-crawler-production`.

## Step 4: Verify Deployment

After deployment completes, you should see output like:

```
✔  Complete
   WeatherCrawlerStack
   CronJobName: weather-crawler-dev-WeatherCrawlerStack-WeatherCrawlerCron
```

### Check CloudWatch Logs

View logs for your Lambda function:

```bash
npx sst logs --stage dev
# or
npx sst logs --stage production
```

### Trigger Manually (Optional)

You can manually invoke the Lambda function for testing:

```bash
aws lambda invoke \
  --function-name weather-crawler-dev-WeatherCrawlerStack-WeatherCrawlerCron \
  --payload '{}' \
  response.json

cat response.json
```

## Step 5: Monitor

The Cron job will run automatically every hour. Monitor it via:

1. **CloudWatch Logs**: Check Lambda execution logs
2. **Database**: Query `weather_alerts` and `weather_alert_zipcodes` tables
3. **CloudWatch Metrics**: View invocation count, errors, and duration

## Troubleshooting

### Deployment Fails

**Issue**: Missing AWS credentials
```
Error: Missing credentials in config
```

**Solution**: Ensure `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are exported in your shell.

---

**Issue**: DATABASE_URL not set
```
Error: DATABASE_URL environment variable is required
```

**Solution**: Verify the `.env` file contains `DATABASE_URL` and it's exported before deployment.

### Lambda Execution Fails

**Issue**: Database connection timeout

**Solution**: 
- Check that your database allows connections from AWS Lambda IPs
- If using Supabase, ensure connection pooling is enabled
- Consider using a VPC for Lambda if database is in a private network

---

**Issue**: Missing lookup files (FIPS/ZIP mappings)

**Solution**: Ensure `data/processed/*.json` files were copied correctly. They should be bundled with the Lambda function.

## Updating the Deployment

To update the Lambda function after making code changes:

```bash
# Source environment variables
export $(grep -v '^#' ../.env | xargs)

# Deploy update
npx sst deploy
```

SST will automatically detect changes and update only the necessary resources.

## Removing the Stack

To completely remove the deployed resources:

```bash
npx sst remove --stage dev
# or
npx sst remove --stage production
```

**Warning**: This removes the Lambda function and EventBridge rule, but does NOT delete data in your database.

## Cost Estimation

Approximate AWS costs (as of 2025):

- **Lambda**: Free tier covers 1M requests/month and 400,000 GB-seconds
  - Hourly execution = ~720 invocations/month (well within free tier)
  - Each invocation < 1 minute at 512 MB = minimal cost
  
- **EventBridge**: $1.00 per million events
  - 720 events/month = $0.00072/month

**Expected Monthly Cost**: $0 (within free tier) to $0.01

## Security Notes

1. **IAM Permissions**: The Lambda function has permissions to:
   - Write CloudWatch Logs
   - Be invoked by EventBridge

2. **Database Credentials**: Stored as environment variable (encrypted at rest)
   - Consider using AWS Secrets Manager for production

3. **Network**: Lambda runs in AWS's default VPC
   - If your database requires VPC access, update the SST config to specify VPC settings

## Next Steps

After successful deployment:

1. Monitor the first few executions in CloudWatch Logs
2. Query the database to verify alerts are being ingested
3. Set up CloudWatch Alarms for failures (optional)
4. Consider implementing SNS notifications for errors (optional)

