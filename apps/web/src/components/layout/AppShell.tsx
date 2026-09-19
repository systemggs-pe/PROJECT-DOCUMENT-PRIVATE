import { Menu } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { LucideIcon } from "lucide-react";

import { Sidebar } from "@/components/layout/Sidebar";
import { SystemFooter } from "@/components/layout/SystemFooter";
import { Topbar } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NavigationSection } from "@/stores/navigation-store";
import { useNavigationStore } from "@/stores/navigation-store";
import { mobilePrimarySections, mobileSectionLabels, navigateToSection } from "./navigation";

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
  const setCurrentSection = useNavigationStore((state) => state.setCurrentSection);
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
          <Topbar title={currentTitle} />
          <div className="app-content">
            {children}
            <SystemFooter />
          </div>
        </main>
      </div>
      <MobileBottomNav
        sections={sections}
        currentSection={currentSection}
        onMore={() => setMobileMenuOpen(true)}
        onNavigate={(section) => {
          setCurrentSection(section);
          navigateToSection(section);
        }}
      />
    </div>
  );
}

function MobileHeader({ title, drawerId, isOpen, onOpen }: { title: string; drawerId: string; isOpen: boolean; onOpen: () => void }) {
  return (
    <header className="mobile-header">
      <div className="mobile-header-title">
        <span className="mobile-section-kicker">GGS Document Studio</span>
        <strong title={title}>{title}</strong>
      </div>
      <Button type="button" variant="ghost" size="icon" aria-label="Abrir mas opciones" aria-controls={drawerId} aria-expanded={isOpen} onClick={onOpen}>
        <Menu className="size-5" aria-hidden={true} />
      </Button>
    </header>
  );
}

function MobileBottomNav({
  currentSection,
  onMore,
  onNavigate,
  sections,
}: {
  currentSection: NavigationSection;
  onMore: () => void;
  onNavigate: (section: NavigationSection) => void;
  sections: Partial<Record<
    NavigationSection,
    {
      title: string;
      description: string;
      icon: LucideIcon;
    }
  >>;
}) {
  const primaryItems = mobilePrimarySections.flatMap((key) => {
    const section = sections[key];
    return section ? [{ key, section }] : [];
  });
  const moreIsActive = !primaryItems.some((item) => item.key === currentSection);

  return (
    <nav className="mobile-bottom-nav" aria-label="Navegacion movil">
      {primaryItems.map(({ key, section }) => {
        const Icon = section.icon;
        const isActive = key === currentSection;
        return (
          <button
            key={key}
            type="button"
            className={cn("mobile-bottom-nav-item", isActive && "is-active")}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onNavigate(key)}
          >
            <Icon className="size-5" aria-hidden={true} />
            <span>{mobileSectionLabels[key] ?? section.title}</span>
          </button>
        );
      })}
      <button
        type="button"
        className={cn("mobile-bottom-nav-item", moreIsActive && "is-active")}
        aria-label="Abrir mas secciones"
        onClick={onMore}
      >
        <Menu className="size-5" aria-hidden={true} />
        <span>Mas</span>
      </button>
    </nav>
  );
}
