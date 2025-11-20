# Weather Alerts Dashboard

A Next.js application that displays real-time weather alerts from the National Weather Service with zip code enrichment and severity tracking.

## Features

- **Real-time Active Alerts**: Displays current weather alerts sorted by earliest start time
- **Zip Code Enrichment**: Shows affected zip codes for each alert derived from geographic boundaries
- **Severity Classification**: Color-coded severity badges (Extreme, Severe, Moderate, Minor)
- **Disaster Type Categorization**: Human-friendly disaster type labels (Flood, Wildfire, Tornado, etc.)
- **Damage Risk Indicators**: Highlights alerts with potential property damage risk
- **Responsive Design**: Mobile-friendly table layout with Tailwind CSS

## Prerequisites

- Node.js 20.9 or higher
- A Supabase project with the weather alerts database setup
- Environment variables configured (see below)

## Installation

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template and fill in your values:

```bash
cp .env.example .env.local
```

3. Update `.env.local` with your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-secret-key
DATABASE_URL=your-postgres-connection-string
```

Get these values from your [Supabase dashboard](https://supabase.com/dashboard/project/_/settings/api).

**Important:** As of November 2025, Supabase recommends using the new **secret keys** (`sb_secret_...`) instead of legacy `service_role` keys. The app supports both for backward compatibility, but please migrate to secret keys. [Learn more](https://github.com/orgs/supabase/discussions/29260).

## Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

The app will hot-reload as you make changes.

## Project Structure

```
alerts-dashboard/
├── app/
│   ├── alerts/
│   │   └── page.tsx          # Active alerts page (Server Component)
│   ├── api/
│   │   └── alerts/
│   │       └── route.ts       # JSON API endpoint for alerts
│   ├── layout.tsx             # Root layout with navigation
│   ├── page.tsx               # Home page
│   └── globals.css            # Global styles
├── utils/
│   └── supabase/
│       └── server.ts          # Supabase server client
├── .env.example               # Environment variable template
└── README.md                  # This file
```

## Shared Database Module

This app uses a shared database access module located at `../shared/alertsDb.ts` which is also used by the backend ingestion scripts in `weather-alerts/`. This ensures a single source of truth for alert querying logic.

### Key Functions

- **`getActiveAlertsForUI(client, options)`**: Fetches active alerts with enrichment
  - Works with both Supabase client (frontend) and pg.Pool (scripts)
  - Returns alerts sorted by earliest time with zip codes, severity levels, and disaster types
  - Supports filtering by `is_damaged` flag and custom limits

- **`getAlertCountsBySeverity(client)`**: Returns alert counts grouped by severity level

### Import Pattern

```typescript
// In Next.js Server Components or Route Handlers
import { getActiveAlertsForUI } from '../../../../shared/alertsDb';
import { createClient } from '@/utils/supabase/server';

const supabase = await createClient();
const alerts = await getActiveAlertsForUI(supabase, { limit: 100 });
```

## API Routes

### GET /api/alerts

Returns active alerts as JSON.

**Query Parameters:**
- `is_damaged` (boolean): Filter by damage risk flag
- `limit` (number): Maximum number of alerts to return (default: 100, max: 500)

**Example:**
```bash
curl http://localhost:3000/api/alerts?is_damaged=true&limit=50
```

**Response:**
```json
{
  "success": true,
  "count": 12,
  "alerts": [
    {
      "id": "alert-123",
      "event": "Flood Warning",
      "severity": "Severe",
      "zipCodes": ["94110", "94107", "94103"],
      "zipSummary": "94110, 94107, 94103",
      "severityLevel": "severe",
      "severityColor": "bg-orange-500 text-white",
      "disasterType": "Flood",
      "is_damaged": true,
      ...
    }
  ]
}
```

## Pages

### Home Page (`/`)

Landing page with overview statistics and navigation to active alerts.

### Active Alerts Page (`/alerts`)

Main dashboard displaying:
- **Column 1**: Event type and timing information
- **Column 2**: Location/area description and NWS office
- **Column 3**: Zip codes, disaster type, severity badges, and metadata
- **Column 4**: Alert status

Alerts are sorted by earliest start time (onset or effective date) to prioritize the most urgent alerts.

## Database Schema

The app reads from two main tables:

### `weather_alerts`
- Core alert properties (event, severity, urgency, certainty)
- Temporal fields (sent, effective, onset, expires)
- Damage risk flag (`is_damaged`)
- Full GeoJSON payload in `raw` field

### `weather_alert_zipcodes`
- Join table mapping alerts to affected zip codes
- One row per (alert_id, zipcode) pair

## Styling

Uses Tailwind CSS for styling with a focus on:
- Clean, professional design
- Responsive layout (mobile to desktop)
- Color-coded severity indicators
- Accessible contrast ratios

## Building for Production

```bash
npm run build
npm start
```

The production build is optimized and ready for deployment to Vercel, Netlify, or any Next.js-compatible hosting platform.

## Environment Variables

| Variable | Description | Exposed to Browser |
|----------|-------------|-------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key (replaces legacy anon key) | Yes |
| `SUPABASE_SECRET_KEY` | Supabase secret key for admin operations (format: `sb_secret_...`) | No (server-only) |
| `SUPABASE_SERVICE_ROLE_KEY` | **LEGACY**: Old service_role JWT (still works but deprecated) | No (server-only) |
| `DATABASE_URL` | PostgreSQL connection string | No (server-only) |

**Security Note**: Only `NEXT_PUBLIC_*` variables are exposed to the browser. The secret/service_role keys and database URL are server-only and never sent to clients.

**Migration Note**: The app supports both new secret keys and legacy service_role keys. Prefer `SUPABASE_SECRET_KEY` (new format) over `SUPABASE_SERVICE_ROLE_KEY` (legacy). Legacy keys will be removed by late 2026.

## Architecture Decisions

1. **Server Components by Default**: The `/alerts` page is a Server Component that directly queries the database on each request, ensuring fresh data without client-side loading states.

2. **Shared Logic**: Database query functions are extracted to `../shared/alertsDb.ts` so they can be reused by both the Next.js app and the Node.js ingestion scripts.

3. **Supabase + Direct Postgres**: Uses Supabase for authentication/sessions and RLS-protected reads, with the option to use direct Postgres connections for privileged operations.

4. **API Routes for Optional Client-Side Access**: While the main page uses Server Components, the `/api/alerts` endpoint is available for client-side fetching or external integrations.

## Troubleshooting

### "Failed to load alerts" error

Check that:
1. Your `.env.local` file has valid Supabase credentials
2. The `weather_alerts` and `weather_alert_zipcodes` tables exist in your database
3. Your Supabase RLS policies allow reading from these tables (or use the service role key)

### No alerts showing

If the database is empty:
1. Run the ingestion scripts in `../weather-alerts/` to populate the database
2. Check that alerts have `status = 'Actual'` (the default filter)

### Module resolution errors

If you see import errors for `../shared/alertsDb`:
- Ensure the `shared/` directory exists at the repo root
- Check that `@types/pg` and `pg` are installed in the Next.js app

## License

Part of the syslink project.
