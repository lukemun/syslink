# Quick Start Guide

Get the Weather Alerts Dashboard running in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- Access to a Supabase project with weather alerts data

## Steps

### 1. Install Dependencies

```bash
cd nextjs
npm install
```

### 2. Configure Environment

Copy the example environment file and fill in your Supabase credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local` and set:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Your Supabase publishable key

Get these from: https://supabase.com/dashboard/project/_/settings/api

### 3. Start Development Server

```bash
npm run dev
```

The dashboard will be available at http://localhost:3000

### 4. View Active Alerts

Navigate to http://localhost:3000/alerts to see the live alerts dashboard.

## Troubleshooting

### "Error loading alerts"

- **Check database connection**: Verify your Supabase credentials in `.env.local`
- **Verify tables exist**: Ensure `weather_alerts` and `weather_alert_zipcodes` tables are created
- **Check RLS policies**: The publishable key may need appropriate Row Level Security policies

### "No active alerts"

This is normal if:
- There are no active weather alerts in your database
- The crawler hasn't populated data yet
- All alerts have expired

### Port Already in Use

If port 3000 is busy, start on a different port:

```bash
PORT=3001 npm run dev
```

## Next Steps

- Read the full [README.md](./README.md) for detailed documentation
- Explore the API at `/api/alerts`
- Customize styling in `app/globals.css`
- Modify alert display in `components/ExpandableAlertRow.tsx`

## Running from Project Root

If you're in the repo root, you can use the convenience scripts:

```bash
npm run nextjs:dev    # Start development server
npm run nextjs:build  # Build for production
npm run nextjs:start  # Start production server
```

