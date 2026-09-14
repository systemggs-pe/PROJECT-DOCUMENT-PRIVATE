import type { Session, User } from "@supabase/supabase-js";
import { create } from "zustand";

import { isSupabaseConfigured, supabase } from "@/lib/supabase";

interface AuthState {
  session: Session | null;
  user: User | null;
  isConfigured: boolean;
  isLoading: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { name: string; email: string; password: string }) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

let authSubscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isConfigured: isSupabaseConfigured,
  isLoading: true,
  error: null,
  initialize: async () => {
    if (!supabase) {
      set({ isLoading: false, isConfigured: false });
      return;
    }

    const { data, error } = await supabase.auth.getSession();
    set({
      session: data.session,
      user: data.session?.user ?? null,
      isLoading: false,
      error: error?.message ?? null,
    });

    if (!authSubscription) {
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        set({
          session,
          user: session?.user ?? null,
          isLoading: false,
          error: null,
        });
      });
      authSubscription = listener.subscription;
    }
  },
  signIn: async (email: string, password: string) => {
    if (!supabase) {
      throw new Error("Supabase no está configurado.");
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(error.message);
    }
  },
  signUp: async ({ name, email, password }) => {
    if (!supabase) {
      throw new Error("Supabase no está configurado.");
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
        },
      },
    });
    if (error) {
      throw new Error(error.message);
    }
  },
  signInWithGoogle: async () => {
    if (!supabase) {
      throw new Error("Supabase no está configurado.");
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      throw new Error(error.message);
    }
  },
  signOut: async () => {
    if (!supabase) {
      set({ session: null, user: null, error: null, isLoading: false });
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
    set({ session: null, user: null, error: null, isLoading: false });
  },
}));
