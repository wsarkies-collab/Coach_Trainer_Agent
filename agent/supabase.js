// Server-side Supabase client (service role: bypasses RLS, never send it to the browser).
// Returns null when Supabase isn't configured, so the kit can run locally on demo data.

let client;
export const supabaseConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function getSupabase() {
  if (!supabaseConfigured()) return null;
  if (!client) {
    const { createClient } = await import("@supabase/supabase-js");
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export const isProduction = () => process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
