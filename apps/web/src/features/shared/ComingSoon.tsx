import type { LucideIcon } from "lucide-react";

interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function ComingSoon({ icon: Icon, title, description }: ComingSoonProps) {
  return (
    <section className="grid min-h-[420px] place-items-center rounded-md border border-[var(--line)] bg-[var(--panel)] p-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-md bg-[var(--nav-active)]">
          <Icon className="size-5 text-[var(--ink)]" aria-hidden={true} />
        </div>
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{description}</p>
      </div>
    </section>
  );
}
