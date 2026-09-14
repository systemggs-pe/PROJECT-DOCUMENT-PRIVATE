import { LogOut, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { useState } from "react";

export function Topbar() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const [error, setError] = useState("");

  async function handleSignOut() {
    try {
      await signOut();
      queryClient.clear();
      window.history.replaceState(null, "", "/login");
    } catch { setError("No se pudo cerrar la sesion. Intenta nuevamente."); }
  }

  return (
    <header className="border-b border-[var(--line)] bg-[var(--surface-elevated)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div>
          <p className="text-sm text-[var(--muted)]">GGS Document Studio</p>
          <h1 className="text-xl font-semibold tracking-normal">Estudio documental</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-md border border-[var(--line)] px-3 py-2 text-sm text-[var(--muted)] md:flex">
            <ShieldCheck className="size-4 text-[var(--success)]" aria-hidden={true} />
            <span>{user?.email ?? "Sesión activa"}</span>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Cerrar sesión" onClick={handleSignOut}>
            <LogOut className="size-4" aria-hidden={true} />
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="px-4 pb-2 text-sm text-red-700">{error}</p>}
    </header>
  );
}
