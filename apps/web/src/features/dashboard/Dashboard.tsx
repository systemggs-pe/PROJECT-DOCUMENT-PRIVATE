import { Activity, Database, FileText, Server } from "lucide-react";

import { useHealth } from "@/hooks/useHealth";

export function Dashboard() {
  const health = useHealth();
  const isApiOnline = health.data?.status === "ok";

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 rounded-md border border-[var(--line)] bg-[var(--panel)] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-normal">GGS Document Studio</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Base inicial para una plataforma de plantillas documentales, generación de PDFs
              privados y trazabilidad por versión.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-[var(--line)] px-3 py-2 text-sm">
            <span
              className={isApiOnline ? "size-2 rounded-full bg-[var(--success)]" : "size-2 rounded-full bg-[var(--danger)]"}
              aria-hidden={true}
            />
            <span>{isApiOnline ? "API conectada" : "API sin conexión"}</span>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Server} label="Backend" value={health.data?.service ?? "Pendiente"} />
        <Metric icon={Database} label="Base de datos" value="Preparada para Prisma" />
        <Metric icon={FileText} label="PDF engine" value="Contrato inicial" />
        <Metric icon={Activity} label="Estado" value={health.isLoading ? "Consultando" : "Fase 1"} />
      </section>

      <section className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] p-5">
        <h3 className="text-lg font-semibold">Alcance actual</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <PhaseItem title="Disponible" text="Shell web, API health check, paquetes compartidos y Prisma inicial." />
          <PhaseItem title="Siguiente" text="Modelos PostgreSQL, Prisma Client y migraciones de la Fase 2." />
          <PhaseItem title="Diferido" text="Editor visual, auth, storage real, generación PDF e historial." />
        </div>
      </section>
    </div>
  );
}

interface MetricProps {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
}

function Metric({ icon: Icon, label, value }: MetricProps) {
  return (
    <article className="rounded-md border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="mb-4 flex size-9 items-center justify-center rounded-md bg-[var(--nav-active)]">
        <Icon className="size-4 text-[var(--ink)]" aria-hidden={true} />
      </div>
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-base font-semibold">{value}</p>
    </article>
  );
}

interface PhaseItemProps {
  title: string;
  text: string;
}

function PhaseItem({ title, text }: PhaseItemProps) {
  return (
    <div className="border-l-2 border-[var(--accent)] pl-3">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{text}</p>
    </div>
  );
}
