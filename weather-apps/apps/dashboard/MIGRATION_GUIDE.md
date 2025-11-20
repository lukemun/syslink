# Migration Guide: Legacy Keys → New Secret Keys

As of **November 2025**, Supabase is actively encouraging migration from legacy JWT-based keys to the new secret key format. This guide helps you migrate your Weather Alerts Dashboard.

## Why Migrate?

The new API key system provides:

- ✅ **Better security** - Keys can be rotated without changing JWT secrets
- ✅ **Granular permissions** - Create multiple secret keys with different access levels (future feature)
- ✅ **Easier management** - No need to mint custom JWTs
- ✅ **Better developer experience** - Clearer naming and purpose

**Timeline:**
- **Now - November 2025**: Migration recommended but optional
- **November 2025 - Late 2026**: Monthly reminders, new projects don't get legacy keys
- **Late 2026**: Legacy keys will be **deleted** and stop working

[Official Supabase Discussion](https://github.com/orgs/supabase/discussions/29260)

---

## Migration Steps

### Step 1: Generate New Secret Key

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **Settings** → **API**
4. Scroll to **Secret keys** section
5. Click **"Generate new secret key"**
6. Give it a name (e.g., "Production Secret Key" or "Alerts Dashboard")
7. Copy the generated key (format: `sb_secret_...`)

**Important:** Save this key securely - you won't be able to see it again!

### Step 2: Update Environment Variables

In your `.env.local` file (or wherever you store production secrets):

**Before:**
```env
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**After:**
```env
SUPABASE_SECRET_KEY=sb_secret_abc123xyz789...
```

**For backward compatibility during transition:**
```env
# New (preferred)
SUPABASE_SECRET_KEY=sb_secret_abc123xyz789...

# Legacy (fallback during migration)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

The app will automatically use `SUPABASE_SECRET_KEY` if present, otherwise fall back to `SUPABASE_SERVICE_ROLE_KEY`.

### Step 3: Update Publishable Key (if needed)

While you're at it, verify your publishable key:

**Legacy format (anon key):**
```env
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**New format (publishable key):**
```env
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_abc123...
```

Both formats work, but the new format is recommended. You can find your publishable key in the same API settings page.

### Step 4: Test the Changes

1. Restart your development server:
   ```bash
   npm run dev
   ```

2. Check the console logs - in development mode, you'll see which key type is being used:
   ```
   [Supabase Admin] Using secret key (new)
   ```

3. Visit the alerts page: http://localhost:3000/alerts

4. Verify that alerts load correctly

### Step 5: Deploy to Production

Once tested locally:

1. Update your production environment variables (Vercel, Netlify, etc.)
2. Deploy the updated code
3. Test the production deployment
4. Remove the legacy `SUPABASE_SERVICE_ROLE_KEY` from your environment once confirmed working

### Step 6: Update Other Services (Optional)

If you have other services using the same Supabase project:
- Backend APIs
- Cron jobs
- Serverless functions
- CI/CD pipelines

Update them to use the new secret key as well.

---

## Rollback Plan

If something goes wrong:

1. The app supports both key types simultaneously
2. Keep your legacy `SUPABASE_SERVICE_ROLE_KEY` in place during testing
3. If issues occur, remove `SUPABASE_SECRET_KEY` and the app will fall back to the legacy key
4. Report issues in the [Supabase discussion](https://github.com/orgs/supabase/discussions/29260)

---

## Code Changes Required

**Good news: None!** 

The Weather Alerts Dashboard was built with this migration in mind. The `utils/supabase/admin.ts` module automatically detects and uses the correct key type:

```typescript
// Automatically tries SUPABASE_SECRET_KEY first,
// falls back to SUPABASE_SERVICE_ROLE_KEY if not found
const supabase = createAdminClient();
```

No code changes needed - just update your environment variables!

---

## Verification Checklist

Before removing your legacy keys completely:

- [ ] Generated new secret key in Supabase Dashboard
- [ ] Updated `.env.local` with `SUPABASE_SECRET_KEY`
- [ ] Tested locally - alerts page loads correctly
- [ ] Checked console logs - confirms using "secret key (new)"
- [ ] Updated production environment variables
- [ ] Deployed to production
- [ ] Tested production deployment
- [ ] Updated other services using the same project (if any)
- [ ] Removed legacy `SUPABASE_SERVICE_ROLE_KEY` after confirming everything works

---

## Common Issues

### "Either SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY must be set"

**Solution:** You need to set at least one admin key. Add `SUPABASE_SECRET_KEY` to your `.env.local` file.

### "Failed to load alerts" after migration

**Possible causes:**
1. **Incorrect key format** - Secret keys should start with `sb_secret_`
2. **Key not generated** - Ensure you created the secret key in Supabase Dashboard
3. **Copy/paste error** - Verify the entire key was copied (they're long!)
4. **Environment not reloaded** - Restart your dev server after changing `.env.local`

### Console shows "Using service_role key (legacy)"

This is fine during migration, but it means:
- You haven't set `SUPABASE_SECRET_KEY` yet
- The app is using the legacy key as fallback
- You should migrate to avoid issues in 2026

---

## Need Help?

- **Supabase Migration Discussion:** https://github.com/orgs/supabase/discussions/29260
- **Dashboard Issues:** Check the main README.md troubleshooting section
- **Supabase Support:** https://supabase.com/support

---

## Summary

1. Generate new secret key in Supabase Dashboard
2. Add `SUPABASE_SECRET_KEY=sb_secret_...` to `.env.local`
3. Test locally
4. Deploy to production
5. Remove legacy keys once confirmed working

**No code changes required!** The app handles the migration automatically. 🎉

