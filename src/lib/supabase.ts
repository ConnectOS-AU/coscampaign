import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * The only Supabase client this app uses. Auth/permissions are owned entirely
 * by this app's own tables (see lib/auth/*), not Supabase Auth or RLS -- so
 * every query goes through the service role, and authorization is enforced
 * in application code (getSession() + requirePermission()) instead of
 * Postgres RLS. Server-only: never expose SUPABASE_SERVICE_ROLE_KEY to the
 * browser.
 */
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
