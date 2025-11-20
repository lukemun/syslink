# Dashboard Removal from SST Configuration

## Summary

The Next.js Alerts Dashboard has been removed from the SST configuration and extracted to a standalone project at `/nextjs` in the repository root.

**Date**: November 20, 2025

## Changes Made

### 1. SST Configuration (`sst.config.ts`)

**Removed:**
- `AlertsDashboard` Next.js resource (lines 59-74)
- Dashboard deployment configuration
- CloudFront/Lambda@Edge infrastructure for the dashboard

**Updated:**
- File-level comments to remove dashboard references
- Output changed from `alertsDashboardUrl` to `crawlerSchedule`

### 2. Package Configuration (`package.json`)

**Updated:**
- Workspaces array changed from `"apps/*"` to `"apps/crawler"` to exclude `apps/dashboard`

### 3. Documentation (`README.md`)

**Updated:**
- Overview section to note dashboard extraction
- Architecture section to remove CloudFront/S3 references
- Directory structure to remove `apps/dashboard`
- Development instructions to remove dashboard references
- Environment variables section to note new dashboard location
- Related Documentation section to point to `/nextjs`

## What Remains in SST

The `weather-apps` SST configuration now only manages:

1. **Weather Crawler Cron Job** - Hourly Lambda function that fetches NWS alerts
2. **Shared Utilities** - Common database access functions
3. **Scripts** - CLI tools for data processing

## The Dashboard

The dashboard is now a **standalone Next.js project** at `/nextjs` and can be:

- Developed independently with `npm run dev`
- Deployed to Vercel, AWS, Docker, or any Node.js hosting
- Run from repo root with `npm run nextjs:dev`

See `/nextjs/README.md` for full documentation.

## Deployment Impact

### Before Next Deployment

When you run `sst deploy`, SST will:
- ✅ Keep the Weather Crawler Cron running
- ⚠️ **Remove** the AlertsDashboard CloudFront distribution and Lambda@Edge functions

### After Deployment

The auto-generated `sst-env.d.ts` file will be updated to remove:

```typescript
"AlertsDashboard": {
  "type": "sst.aws.Nextjs"
  "url": string
}
```

### Cleanup

If you want to immediately remove the deployed dashboard resources:

```bash
cd weather-apps
sst remove --stage <your-stage>
sst deploy --stage <your-stage>
```

Or just let it happen naturally on the next `sst deploy`.

## Migration Checklist

- [x] Removed AlertsDashboard from `sst.config.ts`
- [x] Updated workspaces in `package.json`
- [x] Updated `README.md` documentation
- [x] Created standalone `/nextjs` project with full documentation
- [x] Added convenience scripts to root `package.json`
- [ ] Run `sst deploy` to apply infrastructure changes (when ready)
- [ ] Update any CI/CD pipelines that reference the dashboard URL
- [ ] Update any external links to the dashboard

## Dashboard URLs

**Old (SST-deployed):**
- Production: `https://[cloudfront-id].cloudfront.net`
- Dev: `https://[dev-cloudfront-id].cloudfront.net`

**New (standalone deployment):**
- You choose! Deploy to Vercel, AWS, or self-host
- See `/nextjs/README.md` for deployment options

## Questions?

- For dashboard issues: See `/nextjs/README.md` or `/nextjs/QUICK_START.md`
- For crawler issues: See `weather-apps/README.md`
- For migration help: See `/nextjs/MIGRATION_NOTES.md`

## Rollback

If you need to restore the dashboard to SST, you can revert these changes:

```bash
cd /Users/lukemunro/Clones/syslink/weather-apps
git diff sst.config.ts package.json README.md
git checkout -- sst.config.ts package.json README.md
```

Then run `sst deploy` to redeploy the dashboard.

