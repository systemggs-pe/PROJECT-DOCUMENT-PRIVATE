import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { LogOut, RefreshCw } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { useCurrentIdentity } from "./authorization";

export function IdentityGate({ children }: { children: React.ReactNode }) {
  const signOut = useAuthStore((state) => state.signOut);
  const cache = useQueryClient();
  const identity = useCurrentIdentity();
  useEffect(() => () => { cache.removeQueries({ queryKey: ["studio"] }); }, [cache]);
  if (identity.isPending) return <div className="p-8" role="status">Comprobando acceso...</div>;
  if (identity.isError || !identity.data?.isActive) return <main className="mx-auto max-w-md space-y-5 p-8">
    <h1 className="text-xl font-semibold">Acceso al estudio</h1>
    <p role="alert">{identity.error instanceof Error ? identity.error.message : "Tu cuenta no esta habilitada."}</p>
    <div className="flex gap-3">
      {!(identity.error instanceof ApiError && [401, 403].includes(identity.error.status)) && <Button onClick={() => void identity.refetch()}><RefreshCw className="mr-2 size-4" />Reintentar</Button>}
      <Button variant="ghost" onClick={() => void signOut().catch(() => useAuthStore.setState({ session: null, user: null }))}><LogOut className="mr-2 size-4" />Salir</Button>
    </div>
  </main>;
  return children;
}
