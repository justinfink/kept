import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side Supabase client (uses anon key, respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase client (uses service role key, bypasses RLS)
// Falls back to anon key for demo mode if service role key is not set
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey) {
    return createClient(supabaseUrl, serviceRoleKey);
  }
  // Fallback: use the anon key (will be subject to RLS)
  // For the hackathon demo with service_role, set SUPABASE_SERVICE_ROLE_KEY in .env.local
  console.warn('SUPABASE_SERVICE_ROLE_KEY not set, using anon key (RLS will apply)');
  return createClient(supabaseUrl, supabaseAnonKey);
}
