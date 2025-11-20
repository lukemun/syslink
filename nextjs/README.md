# Weather Alerts Dashboard

A Next.js dashboard for viewing and analyzing severe weather alerts from the National Weather Service (NWS) with real-time zip code enrichment and damage assessment.

## Features

- **Real-time Alert Monitoring**: Displays active weather alerts from the NWS with automatic updates
- **Zip Code Enrichment**: Automatically identifies affected zip codes from alert geographic boundaries
- **Severity Classification**: Categorizes alerts by severity (Extreme, Severe, Moderate, Minor)
- **Disaster Type Mapping**: Maps NWS event types to simplified disaster categories for damage assessment
- **Update History Tracking**: Shows superseded alert versions with expandable update history
- **Responsive Design**: Built with Tailwind CSS for mobile-first responsive layouts

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **React**: 19.0
- **TypeScript**: 5.x
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS 4
- **Fonts**: Geist Sans & Geist Mono

## Prerequisites

- Node.js 18+ and npm (or yarn/pnpm)
- A Supabase project with the weather alerts schema deployed
- Environment variables configured (see Setup below)

## Installation

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file based on `.env.example`:

```bash
cp .env.example .env.local
```

3. Fill in your Supabase credentials in `.env.local`:
   - Get `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from your Supabase project settings
   - Optionally set `SUPABASE_SECRET_KEY` for admin operations (server-side only)

## Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

- `npm run dev` - Start the development server on port 3000
- `npm run build` - Build the production application
- `npm start` - Start the production server (requires `npm run build` first)
- `npm run lint` - Run ESLint to check for code issues

## Project Structure

```
nextjs/
├── app/                    # Next.js App Router pages and layouts
│   ├── alerts/            # Active alerts dashboard page
│   ├── api/               # API route handlers
│   ├── layout.tsx         # Root layout with navigation
│   ├── page.tsx           # Home page
│   └── globals.css        # Global styles and Tailwind imports
├── components/            # React components
│   ├── ExpandableAlertRow.tsx  # Alert table row with expansion
│   └── LocalTime.tsx      # Client-side time formatter
├── shared/                # Shared utilities and database access
│   └── alertsDb.ts        # Database queries for weather alerts
├── utils/                 # Helper utilities
│   └── supabase/          # Supabase client configurations
│       ├── server.ts      # Server-side Supabase client
│       └── admin.ts       # Admin Supabase client
├── public/                # Static assets
├── .env.example           # Environment variables template
├── next.config.ts         # Next.js configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Dependencies and scripts
```

## Database Schema

This dashboard expects the following tables in your Supabase database:

- `weather_alerts` - Main alerts table with NWS alert data
- `weather_alert_zipcodes` - Zip code mappings for each alert

See the `supabase/migrations/` directory in the parent repo for schema definitions.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase publishable (anon) key |
| `SUPABASE_SECRET_KEY` | No | New admin secret key (recommended) |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Legacy service role key (deprecated in 2026) |
| `NODE_ENV` | No | Node environment (development/production) |

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import the project in Vercel
3. Set environment variables in the Vercel dashboard
4. Deploy

### Docker

Build and run with Docker:

```bash
docker build -t weather-alerts-dashboard .
docker run -p 3000:3000 weather-alerts-dashboard
```

### AWS Lambda / OpenNext

The project is configured with `output: "standalone"` in `next.config.ts` for AWS Lambda deployment via OpenNext.

## Usage

### Viewing Alerts

1. Navigate to `/alerts` to see the active alerts dashboard
2. Alerts are sorted by onset time (earliest first)
3. Click on alerts with update history to expand and view previous versions
4. Hover over zip code summaries to see the full list

### API Endpoints

The dashboard exposes a JSON API at `/api/alerts`:

```bash
# Get all active alerts (limited to 100)
GET /api/alerts

# Get only damage-risk alerts
GET /api/alerts?is_damaged=true

# Limit results
GET /api/alerts?limit=50
```

## Contributing

1. Follow the existing code style
2. Add file-level comments describing purpose and usage
3. Include simple function documentation for exported functions
4. Test changes locally before submitting

## License

Private - Internal Use Only

