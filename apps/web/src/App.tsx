import { Building2, FileClock, Files, FileOutput, Gauge, Layers3, Settings, ShieldCheck, UsersRound } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { AuthPage } from "@/features/auth/AuthPage";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { IdentityGate } from "@/features/auth/IdentityGate";
import { can, useCurrentIdentity } from "@/features/auth/authorization";
import { useAuthStore } from "@/stores/auth-store";
import { useNavigationStore } from "@/stores/navigation-store";

const Studio = lazy(() => import("@/features/studio/Studio"));
const History = lazy(() => import("@/features/studio/History"));
const GenerationDetail = lazy(() => import("@/features/studio/GenerationDetail"));
const FileLibrary = lazy(() => import("@/features/files/FileLibrary"));
const GeneratePage = lazy(() => import("@/features/generation/GeneratePage"));
const UsersPage = lazy(() => import("@/features/admin/UsersPage"));
const RolesPage = lazy(() => import("@/features/admin/RolesPage"));
const OrganizationsPage = lazy(() => import("@/features/admin/OrganizationsPage"));
const OrganizationPage = lazy(() => import("@/features/admin/OrganizationPage"));

const sections = {
  dashboard: {
    title: "Dashboard",
    description: "Estado operativo del estudio documental.",
    icon: Gauge,
  },
  templates: {
    title: "Plantillas",
    description: "Plantillas y documentos.",
    icon: Layers3,
  },
  generate: {
    title: "Generar",
    description: "Completa una plantilla.",
    icon: FileOutput,
  },
  files: {
    title: "Archivos",
    description: "Imagenes privadas.",
    icon: Files,
  },
  generations: {
    title: "Generaciones",
    description: "Documentos generados.",
    icon: FileClock,
  },
  organizations: {
    title: "Organizaciones",
    description: "Tenants y estado.",
    icon: Building2,
  },
  organization: {
    title: "Mi organización",
    description: "Datos del tenant.",
    icon: Building2,
  },
  users: {
    title: "Usuarios",
    description: "Accesos y estado.",
    icon: UsersRound,
  },
  roles: {
    title: "Roles",
    description: "Permisos configurables.",
    icon: ShieldCheck,
  },
  audit: {
    title: "Auditoría",
    description: "Eventos sensibles.",
    icon: ShieldCheck,
  },
  settings: {
    title: "Configuración",
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
      setPathname(path);
      setCurrentSection(path.startsWith("/templates") ? "templates" : path.startsWith("/generate") ? "generate" : path.startsWith("/files") ? "files" : path.startsWith("/generations") ? "generations" : path.startsWith("/organizations") ? "organizations" : path.startsWith("/organization") ? "organization" : path.startsWith("/users") ? "users" : path.startsWith("/roles") ? "roles" : path.startsWith("/audit") ? "audit" : path.startsWith("/settings") ? "settings" : "dashboard");
    };
    syncRoute();
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, [setCurrentSection]);

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--surface)] text-sm text-[var(--muted)]">
        Cargando sesión...
      </div>
    );
  }

  if (!session) {
    return <AuthPage />;
  }

  const visibleSections = {
    dashboard: sections.dashboard,
    ...(can(identity.data, "generations.create") ? { generate: sections.generate } : {}),
    ...(can(identity.data, "generations.read") ? { generations: sections.generations } : {}),
    ...(can(identity.data, "templates.read") ? { templates: sections.templates } : {}),
    ...(can(identity.data, "files.read") ? { files: sections.files } : {}),
    ...(can(identity.data, "organizations.read") && identity.data?.roles.some((role) => role.key === "SUPERADMIN") ? { organizations: sections.organizations } : {}),
    ...(can(identity.data, "organizations.read") && identity.data?.organizationId ? { organization: sections.organization } : {}),
    ...(can(identity.data, "users.read") ? { users: sections.users } : {}),
    ...(can(identity.data, "roles.read") ? { roles: sections.roles } : {}),
    ...(can(identity.data, "audit.read") ? { audit: sections.audit } : {}),
    settings: sections.settings,
  };
  const requiredPermission = currentSection === "generate" ? "generations.create" : currentSection === "generations" ? "generations.read" : currentSection === "templates" ? "templates.read" : currentSection === "files" ? "files.read" : currentSection === "organizations" || currentSection === "organization" ? "organizations.read" : currentSection === "users" ? "users.read" : currentSection === "roles" ? "roles.read" : currentSection === "audit" ? "audit.read" : "";

  return (
    <IdentityGate><AppShell sections={visibleSections}>
      <Suspense fallback={<p role="status">Cargando...</p>}>
      {requiredPermission && !can(identity.data, requiredPermission) ? <AccessDenied /> : currentSection === "dashboard" ? (
        <Dashboard />
      ) : currentSection === "templates" ? <Studio /> : currentSection === "generate" ? <GeneratePage /> : currentSection === "files" ? <FileLibrary /> : currentSection === "generations" ? (pathname.startsWith("/generations/") ? <GenerationDetail /> : <History />) : currentSection === "organizations" ? <OrganizationsPage /> : currentSection === "organization" ? <OrganizationPage /> : currentSection === "users" ? <UsersPage /> : currentSection === "roles" ? <RolesPage /> : currentSection === "audit" ? <section className="empty-state"><h2>Auditoría</h2><p>Los eventos sensibles ya se registran en backend. La vista detallada queda preparada para la siguiente iteración administrativa.</p></section> : <section className="space-y-3"><h2 className="text-xl font-semibold">Mi cuenta</h2><p className="break-all">{session.user.email}</p><p>Acceso habilitado</p></section>}
      </Suspense>
    </AppShell></IdentityGate>
  );
}

function AccessDenied() {
  return <section className="empty-state" role="alert"><h2>403 - Acceso denegado</h2><p>No tienes permisos para acceder a esta sección.</p><Button variant="ghost" onClick={() => { window.history.pushState(null, "", "/"); window.dispatchEvent(new PopStateEvent("popstate")); }}>Volver</Button></section>;
}
