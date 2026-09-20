import { Activity, Database, FileText, Server } from "lucide-react";

import { useHealth } from "@/hooks/useHealth";

export function Dashboard() {
  const health = useHealth();
  const isApiOnline = health.data?.status === "ok";
  const databaseLabel = health.data?.database === "connected" ? "Conectada" : "Pendiente";

  return (
    <div className="grid gap-5">
      <section className="grid gap-4 rounded-md border border-[var(--line)] bg-[var(--panel)] p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-normal">Panel principal</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Administra plantillas, crea documentos PDF y consulta el historial de trabajos realizados.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-[var(--line)] px-3 py-2 text-sm">
            <span
              className={isApiOnline ? "size-2 rounded-full bg-[var(--success)]" : "size-2 rounded-full bg-[var(--danger)]"}
              aria-hidden={true}
            />
            <span>{isApiOnline ? "Servicio disponible" : "Servicio sin conexión"}</span>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Server} label="Servicio" value={health.data?.service ?? "Pendiente"} />
        <Metric icon={Database} label="Datos del sistema" value={databaseLabel} />
        <Metric icon={FileText} label="Generador de PDF" value="Listo para usar" />
        <Metric icon={Activity} label="Estado general" value={health.isLoading ? "Consultando" : "Operativo"} />
      </section>

      <section className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] p-5">
        <h3 className="text-lg font-semibold">Funciones disponibles</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <PhaseItem title="Acceso de usuarios" text="Cada persona entra con su cuenta y ve solo lo que tiene permitido." />
          <PhaseItem title="Plantillas" text="Editor visual para preparar páginas, imágenes, textos y versiones." />
          <PhaseItem title="Archivos" text="Carga segura de imágenes y documentos en una biblioteca privada." />
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
