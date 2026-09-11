import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNavigationStore, type NavigationSection } from "@/stores/navigation-store";

interface SidebarProps {
  sections: Record<
    NavigationSection,
    {
      title: string;
      description: string;
      icon: LucideIcon;
    }
  >;
}

const sectionOrder: NavigationSection[] = ["dashboard", "templates", "generations", "settings"];

export function Sidebar({ sections }: SidebarProps) {
  const currentSection = useNavigationStore((state) => state.currentSection);
  const setCurrentSection = useNavigationStore((state) => state.setCurrentSection);

  return (
    <aside className="border-b border-[var(--line)] bg-[var(--panel)] lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col gap-5 px-4 py-4">
        <div className="flex items-center gap-3 px-2">
          <div className="grid size-10 place-items-center rounded-md bg-[var(--ink)] text-sm font-black text-white">
            GGS
          </div>
          <div>
            <p className="text-base font-semibold leading-tight">Document Studio</p>
            <p className="text-sm text-[var(--muted)]">Fase 1</p>
          </div>
        </div>

        <nav className="grid gap-1">
          {sectionOrder.map((key) => {
            const section = sections[key];
            const Icon = section.icon;
            const isActive = key === currentSection;

            return (
              <Button
                key={key}
                type="button"
                variant="ghost"
                className={cn(
                  "h-11 justify-start gap-3 rounded-md px-3 text-[var(--muted)]",
                  isActive && "bg-[var(--nav-active)] text-[var(--ink)]",
                )}
                aria-current={isActive ? "page" : undefined}
                onClick={() => setCurrentSection(key)}
              >
                <Icon className="size-4" aria-hidden={true} />
                <span>{section.title}</span>
              </Button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
