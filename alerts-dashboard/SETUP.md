# Setup Instructions for Weather Alerts Dashboard

## Quick Start

1. **Copy environment variables from root to dashboard**

The root `.env` file should already have your Supabase credentials. You need to create a `.env.local` file in this directory with the same values.

```bash
# From the alerts-dashboard directory, run:
cat > .env.local << 'EOF'
# Copy these values from the root .env file in /Users/lukemunro/Clones/syslink/.env

NEXT_PUBLIC_SUPABASE_URL=<your-value-here>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-value-here>
SUPABASE_SERVICE_ROLE_KEY=<your-value-here>
DATABASE_URL=<your-value-here>
EOF
```

2. **Start the development server**

```bash
npm run dev
```

3. **Open the dashboard**

Navigate to [http://localhost:3000](http://localhost:3000)

## Environment Variable Reference

You need these variables from your Supabase project:

| Variable | Where to find it | Purpose |
|----------|------------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → Project URL | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase Dashboard → Settings → API → Publishable key | Safe for browser use |
| `SUPABASE_SECRET_KEY` | Supabase Dashboard → Settings → API → Secret keys (click "Generate new secret key") | Server-only, bypasses RLS (NEW FORMAT) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → service_role (legacy) | Server-only, bypasses RLS (LEGACY - use secret key above) |
| `DATABASE_URL` | Supabase Dashboard → Settings → Database → Connection string → URI | Direct Postgres connection |

**⚠️ Important as of November 2025:** Supabase is transitioning to new API keys. Use `SUPABASE_SECRET_KEY` (format: `sb_secret_...`) instead of the legacy `service_role` key. The app supports both, but legacy keys will stop working in late 2026. [More info](https://github.com/orgs/supabase/discussions/29260)

## Testing the Setup

Once you have the `.env.local` file configured:

1. Run `npm run dev`
2. Visit `http://localhost:3000/alerts`
3. You should see a table of active alerts (or "No active alerts" if the database is empty)

If you see errors:
- Check that all environment variables are set correctly
- Verify that the `weather_alerts` and `weather_alert_zipcodes` tables exist in your database
- Run the ingestion scripts in `../weather-alerts/` to populate the database if it's empty

## Building for Production

```bash
npm run build
npm start
```

The production server will run on port 3000 by default.

