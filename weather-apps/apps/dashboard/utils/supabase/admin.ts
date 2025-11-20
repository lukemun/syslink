/**
 * Supabase admin client for privileged server-side operations
 * 
 * Purpose: Creates a Supabase client with elevated privileges for server-only use.
 * Supports both new secret keys (sb_secret_...) and legacy service_role keys.
 * 
 * Usage:
 *   import { createAdminClient } from '@/utils/supabase/admin';
 *   
 *   // In API routes or server-only code
 *   const supabase = createAdminClient();
 *   const { data } = await supabase.from('weather_alerts').select();
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client with admin/elevated privileges.
 * Bypasses Row Level Security (RLS) policies.
 * 
 * Supports both:
 * - New secret keys (SUPABASE_SECRET_KEY with format sb_secret_...)
 * - Legacy service_role keys (SUPABASE_SERVICE_ROLE_KEY with JWT format)
 * 
 * @returns Supabase client with elevated privileges
 * @throws Error if no admin key is configured
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  
  // Try new secret key first (recommended as of November 2025)
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  
  // Fall back to legacy service_role key for backward compatibility
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  const adminKey = secretKey || serviceRoleKey;
  
  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is required');
  }
  
  if (!adminKey) {
    throw new Error(
      'Either SUPABASE_SECRET_KEY (new format) or SUPABASE_SERVICE_ROLE_KEY (legacy) must be set. ' +
      'Generate a new secret key at: https://supabase.com/dashboard/project/_/settings/api'
    );
  }

  // Log which key type is being used (only in development)
  if (process.env.NODE_ENV === 'development') {
    const keyType = secretKey ? 'secret key (new)' : 'service_role key (legacy)';
    console.log(`[Supabase Admin] Using ${keyType}`);
    
    if (!secretKey && serviceRoleKey) {
      console.warn(
        '[Supabase Admin] WARNING: Using legacy service_role key. ' +
        'Please migrate to the new secret key format before late 2026. ' +
        'See: https://github.com/orgs/supabase/discussions/29260'
      );
    }
  }

  return createClient(supabaseUrl, adminKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

