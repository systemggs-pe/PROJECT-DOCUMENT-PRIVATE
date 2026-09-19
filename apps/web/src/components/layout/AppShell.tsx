import { Menu } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { LucideIcon } from "lucide-react";

import { Sidebar } from "@/components/layout/Sidebar";
import { SystemFooter } from "@/components/layout/SystemFooter";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/button";
import type { NavigationSection } from "@/stores/navigation-store";
import { useNavigationStore } from "@/stores/navigation-store";

interface AppShellProps {
  children: React.ReactNode;
  sections: Partial<Record<
    NavigationSection,
    {
      title: string;
      description: string;
      icon: LucideIcon;
    }
  >>;
}

export function AppShell({ children, sections }: AppShellProps) {
  const drawerId = useId();
  const currentSection = useNavigationStore((state) => state.currentSection);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentTitle = sections[currentSection]?.title ?? "Dashboard";

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileMenuOpen]);

  return (
    <div className="app-shell bg-[var(--surface)] text-[var(--ink)]">
      <a className="skip-link" href="#main-content">Saltar al contenido</a>
      <MobileHeader title={currentTitle} drawerId={drawerId} isOpen={mobileMenuOpen} onOpen={() => setMobileMenuOpen(true)} />
      <div className="app-layout">
        <div className="desktop-sidebar">
          <Sidebar sections={sections} />
        </div>
        <button type="button" className={`mobile-drawer-overlay ${mobileMenuOpen ? "is-open" : ""}`} aria-label="Cerrar menu" onClick={() => setMobileMenuOpen(false)} />
        <div className={`mobile-drawer ${mobileMenuOpen ? "is-open" : ""}`} id={drawerId} role="dialog" aria-modal="true" aria-label="Menu principal" aria-hidden={!mobileMenuOpen} inert={!mobileMenuOpen}>
          <Sidebar sections={sections} onNavigate={() => setMobileMenuOpen(false)} onClose={() => setMobileMenuOpen(false)} isMobile />
        </div>
        <main className="app-main" id="main-content" tabIndex={-1}>
          <Topbar />
          <div className="app-content">
            {children}
            <SystemFooter />
          </div>
        </main>
      </div>
    </div>
  );
}

function MobileHeader({ title, drawerId, isOpen, onOpen }: { title: string; drawerId: string; isOpen: boolean; onOpen: () => void }) {
  return (
    <header className="mobile-header">
      <Button type="button" variant="ghost" size="icon" aria-label="Abrir menu" aria-controls={drawerId} aria-expanded={isOpen} onClick={onOpen}>
        <Menu className="size-5" aria-hidden={true} />
      </Button>
      <div className="mobile-header-brand" aria-label="GGS Document Studio">
        <span className="mobile-logo">GGS</span>
        <span>Document Studio</span>
      </div>
      <span className="mobile-section-pill" title={title}>{title}</span>
    </header>
  );
}
