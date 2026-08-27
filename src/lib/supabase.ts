import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase is optional in local dev. When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// are provided (see .env.example) the real client is used; otherwise the app runs
// against the local store so `npm run dev` works with zero setup.

/**
 * JWTs and URLs are pure printable ASCII. Strip spaces and anything outside that
 * range (zero-width spaces, BOM, smart quotes, NBSP, newlines) that sneaks in
 * when pasting env values into a dashboard — any such char inside the anon key
 * breaks fetch with a "non ISO-8859-1 code point" error (it is sent as a header).
 */
function clean(v?: string): string | undefined {
  if (!v) return undefined;
  const out = v.replace(/[^\x21-\x7E]/g, "");
  return out || undefined;
}

const url = clean(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const anonKey = clean(import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

// Guard against a truncated/masked key pasted into a dashboard (a valid anon
// JWT is ~200+ chars). Helps diagnose "Invalid API key" fast.
if (anonKey && anonKey.length < 100) {
  console.warn(
    `[supabase] VITE_SUPABASE_ANON_KEY looks too short (${anonKey.length} chars). ` +
      "It was likely pasted masked/truncated — set the full anon key."
  );
}

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;
