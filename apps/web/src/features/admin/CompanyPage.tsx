import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, LoaderCircle, Save } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { apiJson } from "@/lib/api";

interface CompanySettings {
  id: string;
  name: string;
  legalName: string | null;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
  updatedAt?: string;
}

type CompanyDraft = Omit<CompanySettings, "id">;

export default function CompanyPage() {
  const company = useQuery({ queryKey: ["company"], queryFn: () => apiJson<CompanySettings>("/company"), staleTime: 30_000 });

  if (company.isPending) return <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando empresa...</div>;
  if (company.isError) return <section className="empty-state" role="alert"><h2>No se pudo cargar la empresa</h2><p>{company.error.message}</p><Button onClick={() => void company.refetch()}>Reintentar</Button></section>;

  return <CompanyForm key={company.data.updatedAt ?? company.data.id} company={company.data} />;
}

function CompanyForm({ company }: { company: CompanySettings }) {
  const cache = useQueryClient();
  const [draft, setDraft] = useState<CompanyDraft>(() => ({
    name: company.name,
    legalName: company.legalName ?? "",
    documentNumber: company.documentNumber ?? "",
    email: company.email ?? "",
    phone: company.phone ?? "",
    address: company.address ?? "",
    logoUrl: company.logoUrl ?? "",
  }));
  const save = useMutation({
    mutationFn: () => apiJson<CompanySettings>("/company", { method: "PATCH", body: JSON.stringify(normalizeDraft(draft)) }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["company"] }),
  });

  return <div className="studio-page">
    <div className="page-heading">
      <div><p className="eyebrow">Empresa</p><h2>{company.name}</h2><p className="page-subtitle">Configuracion global de GGS Document Studio.</p></div>
      <Building2 className="size-6 text-[var(--accent)]" />
    </div>
    <section className="company-form">
      <div className="section-heading"><div><p className="eyebrow">Datos globales</p><h3>Identidad de la empresa</h3></div><Button onClick={() => void save.mutate()} disabled={save.isPending || !draft.name.trim()}><Save className="mr-2 size-4" />Guardar</Button></div>
      <div className="company-form-grid">
        <label className="field"><span>Nombre</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
        <label className="field"><span>Razon social</span><input value={draft.legalName ?? ""} onChange={(event) => setDraft((current) => ({ ...current, legalName: event.target.value }))} /></label>
        <label className="field"><span>Documento</span><input value={draft.documentNumber ?? ""} onChange={(event) => setDraft((current) => ({ ...current, documentNumber: event.target.value }))} /></label>
        <label className="field"><span>Email</span><input type="email" value={draft.email ?? ""} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></label>
        <label className="field"><span>Telefono</span><input value={draft.phone ?? ""} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} /></label>
        <label className="field"><span>Logo URL</span><input value={draft.logoUrl ?? ""} onChange={(event) => setDraft((current) => ({ ...current, logoUrl: event.target.value }))} /></label>
        <label className="field company-form-wide"><span>Direccion</span><input value={draft.address ?? ""} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} /></label>
      </div>
      {save.isSuccess && <p className="studio-success" role="status">Configuracion guardada.</p>}
      {save.error && <p className="studio-error" role="alert">{save.error.message}</p>}
    </section>
  </div>;
}

function normalizeDraft(draft: CompanyDraft) {
  return Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, typeof value === "string" && !value.trim() ? null : value]));
}

