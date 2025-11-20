/**
 * Supabase server client for Next.js App Router
 * 
 * Purpose: Creates a Supabase client for use in Server Components, Route Handlers,
 * and Server Actions. Uses cookie-based session management via @supabase/ssr.
 * 
 * Usage:
 *   import { createClient } from '@/utils/supabase/server';
 *   
 *   // In a Server Component or Route Handler
 *   const supabase = await createClient();
 *   const { data } = await supabase.from('weather_alerts').select();
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

