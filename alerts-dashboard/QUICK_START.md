# Quick Start Guide

## ⚡️ Get Up and Running in 3 Steps

### Step 1: Set Environment Variables

Create `.env.local` in this directory:

```bash
cd /Users/lukemunro/Clones/syslink/alerts-dashboard

# Copy your Supabase credentials from the root .env file
cat > .env.local << 'EOF'
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-secret-key-here
DATABASE_URL=your-database-url
EOF
```

Replace the placeholder values with your actual Supabase credentials.

**🔑 Key Format Update (November 2025):**
- Use the new **secret key** format (`sb_secret_...`) from Supabase Dashboard → Settings → API → Secret keys
- Legacy `service_role` keys still work but are deprecated
- [Migration guide](https://github.com/orgs/supabase/discussions/29260)

### Step 2: Start Development Server

```bash
npm run dev
```

### Step 3: Open Dashboard

Visit: **http://localhost:3000/alerts**

---

## 🎯 What You'll See

### Home Page (`/`)
- Overview and introduction
- Navigation to active alerts

### Active Alerts (`/alerts`)
A table showing:
- **Event & Time** - What type of alert and when it starts/expires
- **Location** - Where the alert applies
- **Zip Codes & Severity** - Affected zip codes, disaster type, severity badges
- **Status** - Alert status (Actual, Test, etc.)

### API Endpoint (`/api/alerts`)
JSON data available at: `http://localhost:3000/api/alerts`

Query parameters:
- `?is_damaged=true` - Only show damage-risk alerts
- `?limit=50` - Limit results

---

## 🔧 Troubleshooting

### "No active alerts"
→ The database is empty. Run the ingestion script:
```bash
cd /Users/lukemunro/Clones/syslink/weather-alerts
npm install  # if not already done
node fetch-active-alerts.js
node --loader ts-node/esm ingest-active-alerts.ts
```

### "Failed to load alerts"
→ Check your `.env.local` file has valid credentials
→ Verify the database tables exist:
```bash
# Connect to your Supabase project and check:
# - weather_alerts table exists
# - weather_alert_zipcodes table exists
```

### Module resolution errors
→ Make sure you ran `npm install` in:
- `/alerts-dashboard`
- `/shared`

---

## 📚 Full Documentation

- **Comprehensive guide:** See `README.md` in this directory
- **Setup details:** See `SETUP.md` in this directory
- **Implementation notes:** See `/ALERTS_DASHBOARD_IMPLEMENTATION.md` at repo root

---

## 🎨 Key Features

✅ **Real-time data** - Shows current active alerts  
✅ **Sorted by urgency** - Earliest alerts first  
✅ **Zip enrichment** - See affected zip codes  
✅ **Color-coded severity** - Easy visual scanning  
✅ **Damage indicators** - Property risk highlights  
✅ **Responsive design** - Works on mobile  
✅ **Fast** - Server-side rendering  

---

**Need help?** Check the full README.md or the implementation summary.

