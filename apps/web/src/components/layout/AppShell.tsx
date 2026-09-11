import type { LucideIcon } from "lucide-react";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import type { NavigationSection } from "@/stores/navigation-store";

interface AppShellProps {
  children: React.ReactNode;
  sections: Record<
    NavigationSection,
    {
      title: string;
      description: string;
      icon: LucideIcon;
    }
  >;
}

export function AppShell({ children, sections }: AppShellProps) {
  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--ink)]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[256px_1fr]">
        <Sidebar sections={sections} />
        <main className="min-w-0">
          <Topbar />
          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
