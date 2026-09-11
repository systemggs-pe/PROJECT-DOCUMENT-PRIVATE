import { FileClock, Gauge, Layers3, Settings } from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { ComingSoon } from "@/features/shared/ComingSoon";
import { useNavigationStore } from "@/stores/navigation-store";

const sections = {
  dashboard: {
    title: "Dashboard",
    description: "Estado operativo del estudio documental.",
    icon: Gauge,
  },
  templates: {
    title: "Plantillas",
    description: "Creación y versionado de plantillas visuales llegará en una fase posterior.",
    icon: Layers3,
  },
  generations: {
    title: "Generaciones",
    description: "El historial de PDFs generados se conectará cuando exista el modelo de datos.",
    icon: FileClock,
  },
  settings: {
    title: "Configuración",
    description: "Credenciales, storage y preferencias se activarán cuando exista autenticación.",
    icon: Settings,
  },
} as const;

export function App() {
  const currentSection = useNavigationStore((state) => state.currentSection);
  const section = sections[currentSection];

  return (
    <AppShell sections={sections}>
      {currentSection === "dashboard" ? (
        <Dashboard />
      ) : (
        <ComingSoon
          icon={section.icon}
          title={section.title}
          description={section.description}
        />
      )}
    </AppShell>
  );
}
