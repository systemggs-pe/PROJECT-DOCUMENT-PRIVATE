import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ImagePlus, LoaderCircle, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { can, useCurrentIdentity } from "@/features/auth/authorization";
import { type CompanySettings, useCompanySettings } from "@/features/company/useCompanySettings";
import { apiFetch, apiJson } from "@/lib/api";

type CompanyDraft = Pick<CompanySettings, "name" | "tradeName" | "legalName" | "documentNumber" | "email" | "phone" | "website" | "address" | "city" | "region" | "country" | "logoUrl" | "logoFileId" | "description" | "slogan" | "footerText">;

const logoTypes = ["image/jpeg", "image/png", "image/webp"];

export default function CompanyPage() {
  const company = useCompanySettings();

  if (company.isPending) return <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando configuracion...</div>;
  if (company.isError) return <section className="empty-state" role="alert"><h2>Error al cargar</h2><p>{company.error.message}</p><Button onClick={() => void company.refetch()}>Reintentar</Button></section>;

  return <CompanyForm key={company.data.updatedAt ?? company.data.id} company={company.data} />;
}

function CompanyForm({ company }: { company: CompanySettings }) {
  const cache = useQueryClient();
  const identity = useCurrentIdentity();
  const canUpdate = can(identity.data, "company.update");
  const [draft, setDraft] = useState<CompanyDraft>(() => toDraft(company));
  const dirty = useMemo(() => JSON.stringify(normalizeDraft(draft)) !== JSON.stringify(normalizeDraft(toDraft(company))), [company, draft]);
  const logoPreview = useQuery({
    queryKey: ["company", "logo", draft.logoFileId],
    queryFn: () => apiJson<{ url: string; expiresIn: number }>(`/files/${draft.logoFileId}/signed-url`),
    enabled: Boolean(draft.logoFileId),
    staleTime: 240_000,
  });

  const save = useMutation({
    mutationFn: (payload: Partial<CompanyDraft>) => apiJson<CompanySettings>("/company", { method: "PATCH", body: JSON.stringify(payload) }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["company"] }),
  });
  const uploadLogo = useMutation({
    mutationFn: async (file: File) => {
      const error = validateLogo(file);
      if (error) throw new Error(error);
      const form = new FormData();
      form.append("file", file);
      const response = await apiFetch("/files", { method: "POST", body: form });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { message?: string; error?: { message?: string } };
        throw new Error(data.error?.message ?? data.message ?? "No se pudo subir el logo.");
      }
      return response.json() as Promise<{ id: string }>;
    },
    onSuccess: (file) => {
      setDraft((current) => ({ ...current, logoFileId: file.id, logoUrl: null }));
      void cache.invalidateQueries({ queryKey: ["files"] });
    },
  });

  function patch<K extends keyof CompanyDraft>(key: K, value: CompanyDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  const logoSrc = draft.logoUrl || logoPreview.data?.url || "";
  const invalid = !draft.name.trim() || Boolean(draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) || Boolean(draft.website && !isUrl(draft.website));

  return <div className="studio-page">
    <div className="page-heading">
      <div><p className="eyebrow">Empresa</p><h2>{company.displayName}</h2><p className="page-subtitle">Datos institucionales y parametros globales de la empresa.</p></div>
      <Building2 className="size-6 text-[var(--accent)]" />
    </div>

    <section className="company-form">
      <div className="section-heading"><div><p className="eyebrow">Informacion general</p><h3>Identidad empresarial</h3></div>{canUpdate && <Button onClick={() => void save.mutate(normalizeDraft(draft))} disabled={save.isPending || !dirty || invalid}><Save className="mr-2 size-4" />{save.isPending ? "Guardando..." : "Guardar cambios"}</Button>}</div>
      <div className="company-form-grid">
        <Field label="Nombre empresarial" value={draft.name} readOnly={!canUpdate} required onChange={(value) => patch("name", value)} />
        <Field label="Nombre comercial" value={draft.tradeName ?? ""} readOnly={!canUpdate} onChange={(value) => patch("tradeName", value)} />
        <Field label="Razon social" value={draft.legalName ?? ""} readOnly={!canUpdate} onChange={(value) => patch("legalName", value)} />
        <Field label="RUC / documento" value={draft.documentNumber ?? ""} readOnly={!canUpdate} onChange={(value) => patch("documentNumber", value)} />
        <Field className="company-form-wide" label="Eslogan" value={draft.slogan ?? ""} readOnly={!canUpdate} onChange={(value) => patch("slogan", value)} />
      </div>
    </section>

    <section className="company-form">
      <div className="section-heading"><div><p className="eyebrow">Contacto</p><h3>Canales institucionales</h3></div></div>
      <div className="company-form-grid">
        <Field label="Correo institucional" type="email" value={draft.email ?? ""} readOnly={!canUpdate} onChange={(value) => patch("email", value)} />
        <Field label="Telefono" value={draft.phone ?? ""} readOnly={!canUpdate} onChange={(value) => patch("phone", value)} />
        <Field className="company-form-wide" label="Sitio web" type="url" value={draft.website ?? ""} readOnly={!canUpdate} onChange={(value) => patch("website", value)} />
      </div>
    </section>

    <section className="company-form">
      <div className="section-heading"><div><p className="eyebrow">Ubicacion</p><h3>Direccion fiscal o comercial</h3></div></div>
      <div className="company-form-grid">
        <Field className="company-form-wide" label="Direccion" value={draft.address ?? ""} readOnly={!canUpdate} onChange={(value) => patch("address", value)} />
        <Field label="Ciudad" value={draft.city ?? ""} readOnly={!canUpdate} onChange={(value) => patch("city", value)} />
        <Field label="Region" value={draft.region ?? ""} readOnly={!canUpdate} onChange={(value) => patch("region", value)} />
        <Field label="Pais" value={draft.country ?? ""} readOnly={!canUpdate} onChange={(value) => patch("country", value)} />
      </div>
    </section>

    <section className="company-form">
      <div className="section-heading"><div><p className="eyebrow">Identidad visual</p><h3>Logo empresarial</h3></div></div>
      <div className="company-logo-panel">
        <div className="company-logo-preview">{logoSrc ? <img src={logoSrc} alt={`Logo de ${draft.name}`} /> : <Building2 className="size-8" />}</div>
        <div className="company-logo-controls">
          <Field label="Logo URL externo" type="url" value={draft.logoUrl ?? ""} readOnly={!canUpdate} onChange={(value) => setDraft((current) => ({ ...current, logoUrl: value, logoFileId: value ? null : current.logoFileId }))} />
          {canUpdate && <div className="admin-actions">
            <label className="image-capture-button">
              <ImagePlus className="size-4" aria-hidden={true} />
              <span>{uploadLogo.isPending ? "Subiendo..." : "Subir logo"}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadLogo.isPending} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) uploadLogo.mutate(file); event.currentTarget.value = ""; }} />
            </label>
            <Button variant="ghost" onClick={() => setDraft((current) => ({ ...current, logoFileId: null, logoUrl: null }))}><Trash2 className="mr-2 size-4" />Quitar logo</Button>
          </div>}
          {company.logoFile && <p className="panel-hint">{company.logoFile.originalName}</p>}
        </div>
      </div>
      {uploadLogo.error && <p className="studio-error" role="alert">{uploadLogo.error.message}</p>}
    </section>

    <section className="company-form">
      <div className="section-heading"><div><p className="eyebrow">Institucional</p><h3>Contenido para documentos</h3></div></div>
      <div className="company-form-grid">
        <TextArea label="Descripcion institucional" value={draft.description ?? ""} readOnly={!canUpdate} onChange={(value) => patch("description", value)} />
        <TextArea label="Pie institucional" value={draft.footerText ?? ""} readOnly={!canUpdate} onChange={(value) => patch("footerText", value)} />
      </div>
    </section>

    {invalid && <p className="studio-error" role="alert">Revisa los campos obligatorios, email o sitio web.</p>}
    {save.isSuccess && <p className="studio-success" role="status">Cambios guardados.</p>}
    {save.error && <p className="studio-error" role="alert">{save.error.message}</p>}
  </div>;
}

function Field({ label, value, onChange, readOnly, required = false, type = "text", className = "" }: { label: string; value: string; onChange: (value: string) => void; readOnly: boolean; required?: boolean; type?: string; className?: string }) {
  return <label className={`field ${className}`}><span>{label}</span><input type={type} value={value} required={required} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} /></label>;
}

function TextArea({ label, value, onChange, readOnly }: { label: string; value: string; onChange: (value: string) => void; readOnly: boolean }) {
  return <label className="field company-form-wide"><span>{label}</span><textarea value={value} readOnly={readOnly} rows={4} onChange={(event) => onChange(event.target.value)} /></label>;
}

function toDraft(company: CompanySettings): CompanyDraft {
  return {
    name: company.name,
    tradeName: company.tradeName ?? "",
    legalName: company.legalName ?? "",
    documentNumber: company.documentNumber ?? "",
    email: company.email ?? "",
    phone: company.phone ?? "",
    website: company.website ?? "",
    address: company.address ?? "",
    city: company.city ?? "",
    region: company.region ?? "",
    country: company.country ?? "Peru",
    logoUrl: company.logoUrl ?? "",
    logoFileId: company.logoFileId ?? null,
    description: company.description ?? "",
    slogan: company.slogan ?? "",
    footerText: company.footerText ?? "",
  };
}

function normalizeDraft(draft: CompanyDraft) {
  return Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, typeof value === "string" && !value.trim() ? null : value]));
}

function validateLogo(file: File) {
  if (!logoTypes.includes(file.type)) return "Solo se permiten JPG, PNG o WebP.";
  if (file.size > 2 * 1024 * 1024) return "El logo no debe superar 2 MB.";
  return "";
}

function isUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
