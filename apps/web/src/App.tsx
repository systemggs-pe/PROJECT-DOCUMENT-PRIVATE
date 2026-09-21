import { ClipboardList, FileClock, Files, FileOutput, Gauge, IdCard, Layers3, LifeBuoy, Settings, ShieldCheck, UsersRound } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { AuthPage } from "@/features/auth/AuthPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { IdentityGate } from "@/features/auth/IdentityGate";
import { canAccessModule, useCurrentIdentity } from "@/features/auth/authorization";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { useAuthStore } from "@/stores/auth-store";
import type { NavigationSection } from "@/stores/navigation-store";
import { useNavigationStore } from "@/stores/navigation-store";

const Studio = lazy(() => import("@/features/studio/Studio"));
const History = lazy(() => import("@/features/studio/History"));
const GenerationDetail = lazy(() => import("@/features/studio/GenerationDetail"));
const FileLibrary = lazy(() => import("@/features/files/FileLibrary"));
const GeneratePage = lazy(() => import("@/features/generation/GeneratePage"));
const UsersPage = lazy(() => import("@/features/admin/UsersPage"));
const RolesPage = lazy(() => import("@/features/admin/RolesPage"));
const OwnerPage = lazy(() => import("@/features/admin/OwnerPage"));
const FileFieldsPage = lazy(() => import("@/features/admin/FileFieldsPage"));
const SettingsPage = lazy(() => import("@/features/settings/SettingsPage"));
const SupportPage = lazy(() => import("@/features/support/SupportPage"));

const sections = {
  dashboard: {
    title: "Panel principal",
    description: "Resumen del estado del sistema.",
    icon: Gauge,
  },
  templates: {
    title: "Plantillas",
    description: "Plantillas y documentos.",
    icon: Layers3,
  },
  generate: {
    title: "Crear documento",
    description: "Completa y genera documentos.",
    icon: FileOutput,
  },
  files: {
    title: "Archivos",
    description: "Biblioteca privada.",
    icon: Files,
  },
  fileFields: {
    title: "Requisitos de archivos",
    description: "Archivos solicitados en plantillas.",
    icon: ClipboardList,
  },
  generations: {
    title: "Historial",
    description: "Documentos creados.",
    icon: FileClock,
  },
  owner: {
    title: "Titular",
    description: "Datos del titular.",
    icon: IdCard,
  },
  users: {
    title: "Usuarios",
    description: "Cuentas y estado.",
    icon: UsersRound,
  },
  roles: {
    title: "Roles",
    description: "Permisos de trabajo.",
    icon: ShieldCheck,
  },
  audit: {
    title: "Registro de actividad",
    description: "Cambios importantes.",
    icon: ShieldCheck,
  },
  support: {
    title: "Soporte",
    description: "Ayuda y contacto.",
    icon: LifeBuoy,
  },
  settings: {
    title: "Mi cuenta",
    description: "Tu cuenta.",
    icon: Settings,
  },
} as const;

export function App() {
  const currentSection = useNavigationStore((state) => state.currentSection);
  const initialize = useAuthStore((state) => state.initialize);
  const session = useAuthStore((state) => state.session);
  const isLoading = useAuthStore((state) => state.isLoading);
  const setCurrentSection = useNavigationStore((state) => state.setCurrentSection);
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const identity = useCurrentIdentity();

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (session && ["/login", "/register"].includes(window.location.pathname)) {
      window.history.replaceState(null, "", "/");
    }
  }, [session]);

  useEffect(() => {
    const syncRoute = () => {
      const path = window.location.pathname;
      if (path.startsWith("/company") || path.startsWith("/organizations") || path.startsWith("/organization")) {
        window.history.replaceState(null, "", "/owner");
      }
      const normalizedPath = window.location.pathname;
      setPathname(normalizedPath);
      setCurrentSection(getSectionFromPath(normalizedPath));
    };
    syncRoute();
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, [setCurrentSection]);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--surface)] text-sm text-[var(--muted)]">
        Cargando sesion...
      </div>
    );
  }

  if (pathname.startsWith("/reset-password")) {
    return <ResetPasswordPage />;
  }

  if (!session) {
    return <AuthPage />;
  }

  const visibleSections = {
    dashboard: sections.dashboard,
    ...(canAccessModule(identity.data, "generate") ? { generate: sections.generate } : {}),
    ...(canAccessModule(identity.data, "generations") ? { generations: sections.generations } : {}),
    ...(canAccessModule(identity.data, "templates") ? { templates: sections.templates } : {}),
    ...(canAccessModule(identity.data, "files") ? { files: sections.files } : {}),
    ...(canAccessModule(identity.data, "fileFields") ? { fileFields: sections.fileFields } : {}),
    ...(canAccessModule(identity.data, "owner") ? { owner: sections.owner } : {}),
    ...(canAccessModule(identity.data, "users") ? { users: sections.users } : {}),
    ...(canAccessModule(identity.data, "roles") ? { roles: sections.roles } : {}),
    ...(canAccessModule(identity.data, "audit") ? { audit: sections.audit } : {}),
    support: sections.support,
    settings: sections.settings,
  };

  return (
    <IdentityGate>
      <AppShell sections={visibleSections}>
        <Suspense fallback={<p role="status">Cargando...</p>}>
          {!canAccessModule(identity.data, currentSection) ? <AccessDenied /> : renderSection(currentSection, pathname)}
        </Suspense>
      </AppShell>
    </IdentityGate>
  );
}

function getSectionFromPath(path: string): NavigationSection {
  if (path.startsWith("/templates")) return "templates";
  if (path.startsWith("/generate")) return "generate";
  if (path.startsWith("/file-fields")) return "fileFields";
  if (path.startsWith("/files")) return "files";
  if (path.startsWith("/generations")) return "generations";
  if (path.startsWith("/owner")) return "owner";
  if (path.startsWith("/users")) return "users";
  if (path.startsWith("/roles")) return "roles";
  if (path.startsWith("/audit")) return "audit";
  if (path.startsWith("/support")) return "support";
  if (path.startsWith("/settings")) return "settings";
  return "dashboard";
}

function renderSection(section: ReturnType<typeof getSectionFromPath>, pathname: string) {
  if (section === "dashboard") return <Dashboard />;
  if (section === "templates") return <Studio />;
  if (section === "generate") return <GeneratePage />;
  if (section === "files") return <FileLibrary />;
  if (section === "fileFields") return <FileFieldsPage />;
  if (section === "generations") return pathname.startsWith("/generations/") ? <GenerationDetail /> : <History />;
  if (section === "owner") return <OwnerPage />;
  if (section === "users") return <UsersPage />;
  if (section === "roles") return <RolesPage />;
  if (section === "audit") return <section className="empty-state"><h2>Registro de actividad</h2><p>Los cambios importantes ya se guardan. La consulta detallada estara disponible en una proxima actualizacion.</p></section>;
  if (section === "support") return <SupportPage />;
  return <SettingsPage />;
}

function AccessDenied() {
  return <section className="empty-state" role="alert"><h2>Acceso no permitido</h2><p>Tu cuenta no tiene permiso para abrir esta seccion.</p><Button variant="ghost" onClick={() => { window.history.pushState(null, "", "/"); window.dispatchEvent(new PopStateEvent("popstate")); }}>Volver al inicio</Button></section>;
}
