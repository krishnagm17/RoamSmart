// Supabase bootstrap — ALL application data, storage + realtime live here.
// Firebase handles authentication only; Supabase recognizes the signed-in user via a
// Firebase JWT bridge: we hand the current Firebase ID token to supabase-js through the
// accessToken option, so every request (PostgREST/Storage/Realtime) carries it as the
// bearer and RLS resolves the user from the token's `sub` claim.
//
// Prerequisites (see supabase/schema.sql for setup SQL):
//  1. Create a Supabase project.
//  2. Register Firebase under Authentication → Third-Party Auth (or JWT Issuers) with
//     your Firebase project id `roamsmart-ee284`, so Supabase accepts the ID token.
//  3. Paste VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in frontend/.env.
//
// Values missing / placeholder => SUPABASE_READY=false and `supabase` is null; the app
// then runs in graceful fallback mode (see src/supabase/userStore.js and
// src/components/roamgroups/groupsStore.js).
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const SUPABASE_READY = !!(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== "your_supabase_project_url" &&
  supabaseAnonKey !== "your_supabase_anon_key" &&
  !String(supabaseUrl).startsWith("you_")
);

// The most recent Firebase ID token for the signed-in user. The accessToken option
// below returns it on every request so the Supabase gateway sees an accepted token.
let currentIdToken = null;

let client = null;
if (supabaseUrl && supabaseAnonKey) {
  try {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      accessToken: async () => currentIdToken,
    });
  } catch (err) {
    console.warn("Supabase client init failed:", err?.message || err);
  }
}

export const supabase = client;

// Remember the Firebase ID token so every Supabase request authenticates as this
// Firebase user (RLS reads auth.jwt() ->> 'sub' === this user's Firebase UID).
// Call after every auth state change (and after token refresh/relogin).
export async function bindFirebaseAuth(firebaseIdToken) {
  if (!client) return false;
  if (!firebaseIdToken) return false;
  currentIdToken = firebaseIdToken;
  return true;
}

export async function clearSupabaseAuth() {
  if (!client) return;
  currentIdToken = null;
  try {
    await client.auth.signOut({ scope: "local" });
  } catch (err) {
    /* ignore — no local session */
  }
}

export function nowIso() {
  return new Date().toISOString();
}