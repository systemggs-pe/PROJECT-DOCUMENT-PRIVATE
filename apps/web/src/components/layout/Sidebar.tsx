import { LogOut, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { systemMetadata } from "@/config/system-metadata";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useNavigationStore, type NavigationSection } from "@/stores/navigation-store";
import { navigateToSection, sectionOrder } from "./navigation";

interface SidebarProps {
  isMobile?: boolean;
  onClose?: () => void;
  onNavigate?: () => void;
  sections: Partial<Record<
    NavigationSection,
    {
      title: string;
      description: string;
      icon: LucideIcon;
    }
  >>;
}

export function Sidebar({ sections, isMobile = false, onClose, onNavigate }: SidebarProps) {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const currentSection = useNavigationStore((state) => state.currentSection);
  const setCurrentSection = useNavigationStore((state) => state.setCurrentSection);
  const [error, setError] = useState("");

  async function handleSignOut() {
    try {
      await signOut();
      queryClient.clear();
      onNavigate?.();
      window.history.replaceState(null, "", "/login");
    } catch { setError("No se pudo cerrar la sesion."); }
  }

  return (
    <aside className={cn("app-sidebar", isMobile && "is-mobile")}>
      <div className="sidebar-inner">
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            GGS
          </div>
          <div className="min-w-0">
            <p>Document Studio</p>
            <span>v{systemMetadata.version}</span>
          </div>
          {isMobile && <Button type="button" variant="ghost" size="icon" className="ml-auto" aria-label="Cerrar menu" onClick={onClose}><X className="size-4" /></Button>}
        </div>

        <nav className="sidebar-nav" aria-label="Navegacion principal">
          {sectionOrder.map((key) => {
            const section = sections[key];
            if (!section) return null;
            const Icon = section.icon;
            const isActive = key === currentSection;

            return (
              <Button
                key={key}
                type="button"
                variant="ghost"
                className={cn(
                  "sidebar-nav-item",
                  isActive && "is-active",
                )}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  setCurrentSection(key);
                  navigateToSection(key);
                  onNavigate?.();
                }}
              >
                <Icon className="size-5" aria-hidden={true} />
                <span>{section.title}</span>
              </Button>
            );
          })}
        </nav>

        {isMobile && <div className="sidebar-footer">
          <div className="sidebar-account" title={user?.email ?? "Sesion activa"}>
            <span>Cuenta</span>
            <strong>{user?.email ?? "Sesion activa"}</strong>
          </div>
          <Button type="button" variant="ghost" className="sidebar-logout" onClick={() => void handleSignOut()}>
            <LogOut className="size-4" aria-hidden={true} />
            <span>Salir</span>
          </Button>
          {error && <p role="alert" className="sidebar-error">{error}</p>}
        </div>}
      </div>
    </aside>
  );
}
