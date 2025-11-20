# Migration Notes: Dashboard Extraction

This document describes the extraction of the Weather Alerts Dashboard from the `weather-apps` monorepo into a standalone Next.js project.

## What Was Done

### 1. Created Standalone Next.js Project Structure

Extracted `weather-apps/apps/dashboard` into a self-contained `nextjs` directory at the repository root with:

- **Configuration Files**: `package.json`, `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`, `.gitignore`
- **App Structure**: Preserved the App Router structure with `app/`, `components/`, `utils/`, and `public/` directories
- **Documentation**: Added comprehensive README, Quick Start guide, and this migration notes file

### 2. Inlined Shared Dependencies

The monorepo shared package `weather-apps/packages/shared/alertsDb.ts` has been copied to `nextjs/shared/alertsDb.ts`:

- All imports now use local path `@/shared/alertsDb` instead of `@/shared/*` (monorepo alias)
- The module remains compatible with both Supabase client (Next.js) and pg.Pool (Node.js scripts)
- No functional changes were made to the module

### 3. Updated Import Paths

All import paths have been updated from monorepo-style to local paths:

**Before (monorepo):**
```typescript
import { getActiveAlertsWithHistory } from '@/shared/alertsDb';  // via ../../packages/shared
```

**After (standalone):**
```typescript
import { getActiveAlertsWithHistory } from '@/shared/alertsDb';  // via ./shared
```

The tsconfig.json `paths` mapping has been simplified:
```json
{
  "paths": {
    "@/*": ["./*"]  // Everything is relative to project root
  }
}
```

### 4. Preserved All Functionality

The following features remain unchanged:

- ✅ Server Components for alert pages
- ✅ Client Components for interactive elements (ExpandableAlertRow, LocalTime)
- ✅ API routes at `/api/alerts`
- ✅ Supabase SSR integration
- ✅ Tailwind CSS 4 styling
- ✅ Update history tracking
- ✅ Zip code enrichment
- ✅ Severity classification

### 5. Environment Configuration

Created `.env.example` with required Supabase configuration:

- `NEXT_PUBLIC_SUPABASE_URL` - Project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Client-side key
- `SUPABASE_SECRET_KEY` - Optional admin key (new format)
- `SUPABASE_SERVICE_ROLE_KEY` - Optional admin key (legacy format)

### 6. Added Convenience Scripts

Updated root `package.json` with convenience commands:

```json
{
  "scripts": {
    "nextjs:dev": "cd nextjs && npm run dev",
    "nextjs:build": "cd nextjs && npm run build",
    "nextjs:start": "cd nextjs && npm start"
  }
}
```

## File Mapping

### Configuration

| Original | New Location | Changes |
|----------|-------------|---------|
| `weather-apps/apps/dashboard/package.json` | `nextjs/package.json` | Name changed to `weather-alerts-dashboard` |
| `weather-apps/apps/dashboard/tsconfig.json` | `nextjs/tsconfig.json` | Removed monorepo path alias for `@/shared/*` |
| `weather-apps/apps/dashboard/next.config.ts` | `nextjs/next.config.ts` | Added file-level comment |
| `weather-apps/apps/dashboard/eslint.config.mjs` | `nextjs/eslint.config.mjs` | Added file-level comment |
| `weather-apps/apps/dashboard/postcss.config.mjs` | `nextjs/postcss.config.mjs` | Added file-level comment |

### Application Code

| Original | New Location | Changes |
|----------|-------------|---------|
| `weather-apps/apps/dashboard/app/` | `nextjs/app/` | No changes |
| `weather-apps/apps/dashboard/components/` | `nextjs/components/` | No changes |
| `weather-apps/apps/dashboard/public/` | `nextjs/public/` | No changes |
| `weather-apps/apps/dashboard/utils/` | `nextjs/utils/` | No changes |
| `weather-apps/packages/shared/alertsDb.ts` | `nextjs/shared/alertsDb.ts` | Inlined (copied) |

### Documentation

| File | Description |
|------|-------------|
| `nextjs/README.md` | Comprehensive project documentation |
| `nextjs/QUICK_START.md` | 5-minute setup guide |
| `nextjs/MIGRATION_NOTES.md` | This file - extraction details |
| `nextjs/.env.example` | Environment variables template |

## Next Steps

### For Development

1. Install dependencies: `cd nextjs && npm install`
2. Configure environment: `cp .env.example .env.local`
3. Start dev server: `npm run dev`

### For the Monorepo

The original `weather-apps/apps/dashboard` can be:

- **Kept temporarily** for comparison and validation
- **Removed** once the standalone version is verified working
- **Archived** with a README redirecting to `nextjs/`

Consider updating `weather-apps/README.md` to note that the dashboard has been extracted.

### For Deployment

The standalone project is ready for deployment to:

- **Vercel** (recommended for Next.js)
- **AWS Lambda** via OpenNext (configured with `output: "standalone"`)
- **Docker** (standard Next.js Dockerfile)
- **Any Node.js hosting** (supports standalone mode)

## Validation Checklist

Before removing the original dashboard, verify:

- [ ] Dev server starts without errors: `npm run dev`
- [ ] Home page loads: http://localhost:3000
- [ ] Alerts page loads with data: http://localhost:3000/alerts
- [ ] API endpoint responds: http://localhost:3000/api/alerts
- [ ] Expandable rows work (if alerts have updates)
- [ ] Local time formatting displays correctly
- [ ] Tailwind styles render properly
- [ ] TypeScript compiles without errors: `npx tsc --noEmit`
- [ ] Linting passes: `npm run lint`
- [ ] Production build succeeds: `npm run build`

## Breaking Changes

None. This is a clean extraction with no functional changes.

## Dependencies

The project has no dependencies on the monorepo structure. All required code has been inlined or uses standard npm packages.

## Questions or Issues?

See the main [README.md](./README.md) for detailed documentation or refer to the [QUICK_START.md](./QUICK_START.md) for common troubleshooting steps.

