import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = isConfiguredValue(supabaseUrl) && isConfiguredValue(supabaseAnonKey);

export const supabase =
  isConfiguredValue(supabaseUrl) && isConfiguredValue(supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
      })
    : null;

function isConfiguredValue(value: string | undefined): value is string {
  return Boolean(value && value.trim() !== "" && !value.includes("your-project") && !value.includes("your-anon-key"));
}
