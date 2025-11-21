# Database Connection Pooling Fix

## Problem Summary

The Lambda function was experiencing connection timeout errors when connecting to Supabase:
- **Original Error**: "connection not available and request was dropped from queue after 10000ms"
- **Updated Error**: "Connection terminated due to connection timeout"

The root cause was improper configuration for serverless database connections.

## Changes Made

### 1. Updated `apps/crawler/src/db.ts`

#### Connection Pool Configuration
- ✅ Added support for `DATABASE_POOLER_URL` (preferred over `DATABASE_URL`)
- ✅ Set `max: 1` connection per Lambda instance (serverless best practice)
- ✅ Increased `connectionTimeoutMillis` from 10s to 20s
- ✅ Set `idleTimeoutMillis: 5000ms` to close idle connections quickly
- ✅ Added `statement_timeout: 30000ms` for query timeouts
- ✅ Added `allowExitOnIdle: true` for graceful shutdown
- ✅ Auto-detects pooler and adds required parameters:
  - `sslmode=require` for pooler connections
  - `pgbouncer=true` for Transaction mode (port 6543)
- ✅ Added connection type logging (POOLER vs DIRECT)

#### Query Improvements
- ✅ Added `SET statement_timeout = 30000` at query level
- ✅ Added timing logs for upsert operations
- ✅ Added parameter count logging for debugging

### 2. Updated `sst.config.ts`

- ✅ Added `DATABASE_POOLER_URL` to `WeatherCrawlerCron` environment
- ✅ Added `DATABASE_POOLER_URL` to `WeatherCrawlerFunction` environment

### 3. Created Test Script

- ✅ `apps/crawler/test-connection.js` - Tests both direct and pooler connections

### 4. Terminated Idle Connections

- ✅ Ran SQL to terminate 2 idle connections in Supabase

## Your Current Configuration

Based on your `.env` file:

```bash
DATABASE_POOLER_URL=postgresql://postgres.xmouwrvfrttuqfpmxmml:****@aws-1-us-east-1.pooler.supabase.com:6543/postgres
```

- **Host**: `aws-1-us-east-1.pooler.supabase.com`
- **Port**: `6543` (Transaction mode - requires `pgbouncer=true`)
- **Database**: `postgres`

## How It Works Now

1. Lambda function starts
2. `getPool()` checks for `DATABASE_POOLER_URL` first
3. Detects pooler connection and adds:
   - `sslmode=require` (for SSL)
   - `pgbouncer=true` (for Transaction mode)
4. Creates pool with 1 connection, 20s timeout
5. Each query sets `statement_timeout = 30000ms`
6. Connection is released after query
7. Pool closes automatically on Lambda shutdown

## Next Steps

### 1. Test Connection Locally

```bash
cd weather-apps/apps/crawler
node test-connection.js
```

This will test both your direct and pooler connections and show you:
- Connection time
- Query execution time  
- Server version
- Any connection errors

### 2. Deploy Updated Lambda

```bash
cd weather-apps
sst deploy
```

Or if you're in dev mode:

```bash
sst dev
```

### 3. Test the Lambda

After deploying, trigger the Lambda via its URL:

```bash
curl https://rbopor7wm7ntk6iapksvdgpww40eqvwi.lambda-url.us-east-1.on.aws
```

### 4. Monitor Logs

Watch for these new log messages:
- ✅ "Using POOLER connection"
- ✅ "Added sslmode=require for pooler connection"
- ✅ "Added pgbouncer=true parameter for Transaction mode"
- ✅ "Upserting X alerts to database..."
- ✅ "Executing upsert query (X parameters)..."
- ✅ "✓ Upsert completed in Xms"

## Troubleshooting

### If pooler connection still fails:

1. **Check Supabase Connection Pooler Settings**:
   - Go to Supabase Dashboard → Settings → Database
   - Ensure Connection Pooling is enabled
   - Verify the pooler URL is correct

2. **Try Session Mode Instead**:
   Replace port `6543` with `5432` in your `DATABASE_POOLER_URL`:
   ```bash
   DATABASE_POOLER_URL=postgresql://postgres.xmouwrvfrttuqfpmxmml:****@aws-1-us-east-1.pooler.supabase.com:5432/postgres
   ```

3. **Use Direct Connection as Fallback**:
   Remove `DATABASE_POOLER_URL` and the code will fall back to `DATABASE_URL`.
   With `max: 1` connection, it should still work fine.

4. **Check Lambda VPC Configuration**:
   If Lambda is in a VPC, ensure it has internet access via NAT Gateway.

### If you see "Authentication error":

This usually means the password or connection string is incorrect. Double-check:
- Username format: `postgres.PROJECT_REF` (not just `postgres`)
- Password is correct
- Project reference matches your Supabase project

## Why This Fixes The Issue

### Before:
- ❌ Used default pool settings (10 connections)
- ❌ No connection timeout handling
- ❌ No query timeouts
- ❌ Missing pgbouncer parameters
- ❌ SSL not properly configured
- ❌ Connections not released quickly

### After:
- ✅ 1 connection per Lambda (serverless optimized)
- ✅ 20s connection timeout
- ✅ 30s query timeout
- ✅ Auto-adds pgbouncer=true for Transaction mode
- ✅ Auto-adds sslmode=require for pooler
- ✅ Connections released after 5s idle
- ✅ Proper error handling and logging

## Additional Resources

- [Supabase Connection Pooling Docs](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [AWS Lambda Best Practices for Database Connections](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [node-postgres Pool Documentation](https://node-postgres.com/apis/pool)

---

**Last Updated**: 2025-11-20



