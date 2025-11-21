# SST v2 to Ion Migration Summary

## Executive Summary

The `weather-crawler` application has been successfully migrated from SST v2 (CDK-based) to SST Ion (Pulumi-based). This migration modernizes the infrastructure configuration while preserving all existing functionality.

## Why Migrate to Ion?

### Benefits

1. **Better Developer Experience**: Ion provides a more streamlined API with less boilerplate
2. **Multi-Cloud Ready**: Built on Pulumi, enabling easier multi-cloud deployments if needed
3. **Modern TypeScript**: First-class TypeScript support with better type inference
4. **Simplified Configuration**: Resources defined directly in `sst.config.ts` without separate stack files
5. **Consistent with Other Projects**: Aligns with the `gf-crawler` architecture pattern

### Migration Timeline

- **Planning**: Analyzed reference project (`gf-crawler`) and existing v2 setup
- **Implementation**: Converted `sst.config.ts` and archived old stack files
- **Documentation**: Created migration guide and deployment checklist
- **Status**: Ready for deployment and verification

## What Changed

### File Changes

| File | Change | Status |
|------|--------|--------|
| `sst.config.ts` | Replaced with Ion-style config | ✅ Complete |
| `stacks/WeatherCrawlerStack.ts` | Archived to `stacks/archive/` | ✅ Complete |
| `stacks/MyStack.ts` | Archived (not in use) | ✅ Complete |
| `README.md` | Updated with Ion references | ✅ Complete |
| `ION_MIGRATION.md` | Created | ✅ New |
| `DEPLOYMENT_CHECKLIST.md` | Created | ✅ New |

### Code Structure Comparison

#### Before (SST v2)

```typescript
// sst.config.ts
import { SSTConfig } from "sst";
import { WeatherCrawlerStack } from "./stacks/WeatherCrawlerStack";

export default {
  config(_input) {
    return {
      name: "weather-crawler",
      region: "us-east-1",
    };
  },
  stacks(app) {
    app.stack(WeatherCrawlerStack);
  }
} satisfies SSTConfig;
```

```typescript
// stacks/WeatherCrawlerStack.ts
import { StackContext, Cron } from "sst/constructs";

export function WeatherCrawlerStack({ stack }: StackContext) {
  const weatherCrawler = new Cron(stack, "WeatherCrawlerCron", {
    schedule: "rate(1 hour)",
    job: {
      handler: "packages/functions/src/index.handler",
      // ... config
    },
  });
}
```

#### After (Ion)

```typescript
// sst.config.ts
/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "weather-crawler",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },

  async run() {
    const isProd = $app.stage === "production";
    const isLocal = $dev;

    // Load .env
    const { config } = await import("dotenv");
    const { resolve } = await import("path");
    config({ path: resolve(process.cwd(), "../.env") });

    // Define resources inline
    const weatherCrawler = new sst.aws.Cron("WeatherCrawlerCron", {
      schedule: "rate(1 hour)",
      job: {
        handler: "packages/functions/src/index.handler",
        // ... config
      },
    });

    return {
      weatherCrawlerCronName: weatherCrawler.id,
    };
  },
});
```

### Key Differences

1. **No separate stack files**: Resources defined directly in `run()`
2. **Async run function**: Enables dynamic imports and async operations
3. **Built-in stage helpers**: `$app.stage`, `$dev` for conditional logic
4. **Type reference**: Uses `/// <reference path="./.sst/platform/config.d.ts" />` for types
5. **Dotenv loading**: Explicitly loads environment variables from parent `.env`

## What Stayed the Same

✅ **No changes to Lambda function code**:
- `packages/functions/src/index.ts` - unchanged
- `packages/functions/src/fetch.ts` - unchanged
- `packages/functions/src/ingest.ts` - unchanged
- `packages/functions/src/db.ts` - unchanged

✅ **Same runtime configuration**:
- Handler path: `packages/functions/src/index.handler`
- Schedule: `rate(1 hour)`
- Memory: `512 MB`
- Timeout: `5 minutes`
- Environment: `DATABASE_URL`
- Dependencies: `pg` installed

✅ **Same deployment commands**:
- `npm run dev` - local development
- `npm run deploy` - deploy to default stage
- `npx sst deploy --stage <name>` - deploy to specific stage

✅ **Same AWS resources**:
- Lambda function (with same handler code)
- EventBridge rule (with same schedule)
- CloudWatch Logs
- IAM roles

## Database Connection Strategy

**Decision: Continue using `DATABASE_URL` (not `SUPABASE_SERVICE_ROLE_KEY`)**

### Rationale

1. **Current code uses `pg` directly**: The Lambda already imports the `pg` library and connects via connection string
2. **Batch workload optimization**: Direct Postgres access is more efficient for bulk inserts than HTTP API calls
3. **No refactoring needed**: Changing to Supabase client would require rewriting `db.ts` and `ingest.ts`
4. **Security equivalence**: Both secrets grant full database access; the choice is about API shape, not security
5. **Best practice for server-side jobs**: Direct database connections are standard for backend batch jobs

### Recommendation

Use the **pooled connection string** from Supabase to avoid connection exhaustion:

```bash
# Preferred (pooled)
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres

# Also works (direct)
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-region.supabase.com:5432/postgres
```

## Testing Plan

See `DEPLOYMENT_CHECKLIST.md` for detailed verification steps:

1. ✅ Pre-deployment checks (environment, credentials, dependencies)
2. ⏳ Initial dev deployment
3. ⏳ AWS resource verification
4. ⏳ Manual invocation test
5. ⏳ CloudWatch Logs verification
6. ⏳ Database verification
7. ⏳ Scheduled execution verification
8. ⏳ Production deployment (optional)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Deployment fails | Low | Medium | Rollback plan documented; v2 files archived |
| Type errors | Medium | Low | Will auto-resolve after first deployment |
| Database connection issues | Low | High | No connection logic changed; same env var |
| Permission errors | Low | Medium | Using same AWS account/credentials |
| Schedule not triggering | Very Low | Medium | EventBridge config unchanged |

## Rollback Plan

If issues arise during deployment:

1. Restore SST v2 files from `stacks/archive/`
2. Restore old `sst.config.ts` from git history
3. Redeploy with `npx sst deploy --stage dev`
4. Document issues and re-plan migration

## Next Steps

1. **Deploy to dev stage**: Run `npx sst deploy --stage dev`
2. **Verify functionality**: Follow `DEPLOYMENT_CHECKLIST.md`
3. **Monitor first few runs**: Check CloudWatch Logs for automatic executions
4. **Deploy to production**: Once dev is stable, deploy to production
5. **Clean up**: Remove old `.sst/` directory if it exists from v2

## Support & Documentation

- **Deployment Guide**: See `ION_MIGRATION.md`
- **Verification Steps**: See `DEPLOYMENT_CHECKLIST.md`
- **General Usage**: See `README.md` (updated for Ion)
- **SST Ion Docs**: https://sst.dev/docs
- **Migration Guide**: https://sst.dev/docs/upgrade-guide

## Migration Completion Criteria

- [x] Ion config created with proper structure
- [x] Resources migrated (Cron job)
- [x] Environment variables preserved
- [x] Old files archived
- [x] Documentation updated
- [ ] Dev deployment successful
- [ ] Manual test passes
- [ ] Scheduled execution verified
- [ ] Production deployment (optional)
- [ ] Team notified

## Questions & Concerns

If you encounter issues or have questions:

1. Check `ION_MIGRATION.md` troubleshooting section
2. Review AWS CloudWatch Logs for specific error messages
3. Verify `.env` file has correct `DATABASE_URL`
4. Ensure AWS credentials have sufficient permissions
5. Compare deployed resources with checklist in `DEPLOYMENT_CHECKLIST.md`

---

**Migration Date**: November 20, 2025  
**Migrated By**: AI Assistant  
**SST Version**: 3.17.23  
**Status**: ✅ Code Complete, ⏳ Awaiting Deployment Verification


