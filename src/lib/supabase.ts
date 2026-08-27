import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Supabase is optional in local dev. When VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
// are provided (see .env.example) the real client is used; otherwise the app runs
// against the local store (src/data/store.ts) so `npm run dev` works with zero setup.

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;
