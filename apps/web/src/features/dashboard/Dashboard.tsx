import type { ComponentType } from "react";
import { Clock3, FileText, FolderOpen, ImagePlus, Layers3 } from "lucide-react";

export function Dashboard() {
  return (
    <div className="grid gap-5">
      <section className="grid gap-4 rounded-md border border-[var(--line)] bg-[var(--panel)] p-5">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-normal">Panel principal</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Prepara tus plantillas, agrega evidencias y genera documentos PDF listos para descargar.
          </p>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Accesos principales">
        <Metric icon={Layers3} label="Plantillas" value="Diseña formatos reutilizables" />
        <Metric icon={ImagePlus} label="Evidencias" value="Carga fotos y archivos" />
        <Metric icon={FileText} label="Documentos" value="Genera PDFs al instante" />
        <Metric icon={Clock3} label="Historial" value="Revisa trabajos creados" />
      </section>

      <section className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] p-5">
        <h3 className="text-lg font-semibold">Flujo recomendado</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <PhaseItem
            title="1. Elige una plantilla"
            text="Selecciona el formato que corresponde al documento que necesitas preparar."
          />
          <PhaseItem
            title="2. Completa los campos"
            text="Agrega fotos, archivos y datos requeridos antes de generar el PDF."
          />
          <PhaseItem
            title="3. Descarga el resultado"
            text="Revisa el documento final y guárdalo desde el historial cuando lo necesites."
          />
        </div>
      </section>

      <section className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)] p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--nav-active)]">
            <FolderOpen className="size-4 text-[var(--ink)]" aria-hidden={true} />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Biblioteca privada</h3>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              Tus imágenes y documentos quedan organizados para volver a usarlos sin cargar el mismo archivo
              varias veces.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

interface MetricProps {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
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
