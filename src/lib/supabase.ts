import { createClient, SupabaseClient } from '@supabase/supabase-js';

function getUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

function getAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
}

// Client-side Supabase client (lazy singleton, uses anon key, respects RLS)
let _supabase: SupabaseClient | null = null;

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_supabase) {
      _supabase = createClient(getUrl(), getAnonKey());
    }
    return (_supabase as any)[prop];
  },
});

// Server-side Supabase client (uses service role key, bypasses RLS)
export function createServiceClient() {
  const url = getUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    return createClient(url, serviceRoleKey);
  }
  console.warn('SUPABASE_SERVICE_ROLE_KEY not set, using anon key (RLS will apply)');
  return createClient(url, getAnonKey());
}
