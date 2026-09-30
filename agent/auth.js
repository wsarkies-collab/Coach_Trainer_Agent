// Works out which user is chatting.
// With Supabase configured, the widget sends the user's Supabase access token
// (the same one your app already has after login) and we verify it with Supabase.
// Without Supabase (local testing only), the token is treated as the user id.

import { getSupabase, isProduction } from "./supabase.js";

export async function identifyUser(token) {
  if (typeof token !== "string" || !token) return null;
  const supabase = await getSupabase();
  if (supabase) {
    const { data, error } = await supabase.auth.getUser(token);
    return error || !data?.user ? null : data.user.id;
  }
  if (isProduction()) throw new Error("Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  return token.slice(0, 128);
}
