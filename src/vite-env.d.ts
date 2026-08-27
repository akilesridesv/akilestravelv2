/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_AI_ENDPOINT?: string;
  readonly VITE_AI_PROVIDER?: string;
  readonly VITE_AI_API_KEY?: string;
  readonly VITE_AI_MODEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
