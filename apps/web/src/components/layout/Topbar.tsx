import { LogOut, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/auth-store";
import { useState } from "react";

export function Topbar({ title = "Estudio documental" }: { title?: string }) {
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
    <header className="desktop-topbar">
      <div className="desktop-topbar-inner">
        <div>
          <p className="desktop-topbar-kicker">GGS Document Studio</p>
          <h1>{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="desktop-account-pill">
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
