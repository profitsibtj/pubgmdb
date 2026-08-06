import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Browser-side counterpart to supabaseClient.ts (which is server-only and
// reads process.env via dotenv). Used by firebaseClient.ts in static/GitHub
// Pages mode, where there is no server to proxy Supabase calls through.
// VITE_SUPABASE_ANON_KEY is safe to expose publicly - by itself it only
// identifies the app. Actual write access is gated by Row Level Security
// policies (see App.tsx's SUPABASE_SETUP_SQL) that require the header set below.
let supabaseInstance: SupabaseClient | null = null;

// Set from App.tsx whenever the action password is verified (or the app locks again), so every
// Supabase request from this browser carries it as a header for the "Admin insert/update/delete"
// RLS policies to check. Not a real secret in this static-hosting setup (see the comment on
// is_admin_request() in App.tsx's SUPABASE_SETUP_SQL) - this exists to stop casual/automated tampering via the publicly
// visible anon key, not a determined attacker who digs through the bundle for this value too.
let currentAdminSecret = "";

export function setSupabaseAdminSecret(secret: string | null | undefined) {
  currentAdminSecret = secret || "";
}

export function getBrowserSupabase(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. Set both as GitHub Actions repository secrets for the static build."
    );
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("x-admin-secret", currentAdminSecret);
        return fetch(input, { ...init, headers });
      }
    }
  });
  return supabaseInstance;
}
