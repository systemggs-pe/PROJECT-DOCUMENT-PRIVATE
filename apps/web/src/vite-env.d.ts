/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
  readonly VITE_SUPPORT_PHONE?: string;
  readonly VITE_SUPPORT_URL?: string;
  readonly VITE_DOCUMENTATION_URL?: string;
  readonly VITE_SUPPORT_HOURS?: string;
}

declare const __APP_VERSION__: string;
declare const __BUILD_SHA__: string;
