import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IdCard, LoaderCircle, Save } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { can, useCurrentIdentity } from "@/features/auth/authorization";
import { type OwnerProfile, useOwnerProfile } from "@/features/owner-profile/useOwnerProfile";
import { apiJson } from "@/lib/api";

type OwnerDraft = Pick<OwnerProfile, "fullName" | "email" | "phone">;
type OwnerDraftErrors = Partial<Record<keyof OwnerDraft, string>>;

export default function OwnerPage() {
  const ownerProfile = useOwnerProfile();

  if (ownerProfile.isPending) return <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando datos del titular...</div>;
  if (ownerProfile.isError) return <section className="empty-state" role="alert"><h2>No se pudieron cargar los datos del titular</h2><p>{ownerProfile.error.message}</p><Button onClick={() => void ownerProfile.refetch()}>Reintentar</Button></section>;

  return <OwnerForm key={ownerProfile.data.updatedAt ?? ownerProfile.data.id} ownerProfile={ownerProfile.data} />;
}

function OwnerForm({ ownerProfile }: { ownerProfile: OwnerProfile }) {
  const cache = useQueryClient();
  const identity = useCurrentIdentity();
  const canUpdate = can(identity.data, "owner.update");
  const [draft, setDraft] = useState<OwnerDraft>(() => toDraft(ownerProfile));
  const errors = useMemo(() => validateDraft(draft), [draft]);
  const dirty = useMemo(() => JSON.stringify(normalizeDraft(draft)) !== JSON.stringify(normalizeDraft(toDraft(ownerProfile))), [ownerProfile, draft]);
  const invalid = Object.keys(errors).length > 0;

  const save = useMutation({
    mutationFn: (payload: OwnerDraft) => apiJson<OwnerProfile>("/owner-profile", { method: "PATCH", body: JSON.stringify(normalizeDraft(payload)) }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["owner-profile"] }),
  });

  function patch<K extends keyof OwnerDraft>(key: K, value: OwnerDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return <div className="studio-page">
    <div className="page-heading">
      <div><h2>Datos del titular</h2><p className="page-subtitle">Informacion minima para identificar al responsable de la cuenta.</p></div>
      <IdCard className="size-6 text-[var(--accent)]" aria-hidden={true} />
    </div>

    <section className="company-form owner-profile-form" aria-labelledby="owner-profile-title">
      <div className="section-heading">
        <div><h3 id="owner-profile-title">Titular</h3><p className="panel-hint">Estos datos no reemplazan la informacion de soporte ni la identidad del proveedor.</p></div>
        {canUpdate && <Button onClick={() => void save.mutate(draft)} disabled={save.isPending || !dirty || invalid}><Save className="mr-2 size-4" aria-hidden={true} />{save.isPending ? "Guardando..." : "Guardar cambios"}</Button>}
      </div>
      <div className="company-form-grid">
        <Field id="owner-full-name" label="Nombre completo" value={draft.fullName} error={errors.fullName} readOnly={!canUpdate} required autoComplete="name" onChange={(value) => patch("fullName", value)} />
        <Field id="owner-phone" label="Telefono / celular" type="tel" value={draft.phone ?? ""} error={errors.phone} readOnly={!canUpdate} autoComplete="tel" onChange={(value) => patch("phone", value)} />
        <Field id="owner-email" label="Correo electronico" type="email" value={draft.email ?? ""} error={errors.email} readOnly={!canUpdate} autoComplete="email" onChange={(value) => patch("email", value)} />
      </div>
    </section>

    {invalid && <p className="studio-error" role="alert">Revisa los campos marcados antes de guardar.</p>}
    {save.isSuccess && <p className="studio-success" role="status">Datos del titular guardados.</p>}
    {save.error && <p className="studio-error" role="alert">{save.error.message}</p>}
  </div>;
}

function Field({ id, label, value, onChange, readOnly, required = false, type = "text", autoComplete, error }: { id: string; label: string; value: string; onChange: (value: string) => void; readOnly: boolean; required?: boolean; type?: string; autoComplete?: string; error?: string | undefined }) {
  const errorId = `${id}-error`;
  return <label className="field" htmlFor={id}>
    <span>{label}{required ? " *" : ""}</span>
    <input id={id} type={type} inputMode={type === "tel" ? "tel" : undefined} autoComplete={autoComplete} value={value} required={required} readOnly={readOnly} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onChange={(event) => onChange(event.target.value)} />
    {error && <small id={errorId} className="field-error" role="alert">{error}</small>}
  </label>;
}

function toDraft(ownerProfile: OwnerProfile): OwnerDraft {
  return {
    fullName: ownerProfile.fullName ?? "",
    email: ownerProfile.email ?? "",
    phone: ownerProfile.phone ?? "",
  };
}

function normalizeDraft(draft: OwnerDraft) {
  return {
    fullName: draft.fullName.trim(),
    email: draft.email?.trim() ? draft.email.trim() : null,
    phone: draft.phone?.trim() ? draft.phone.trim() : null,
  };
}

function validateDraft(draft: OwnerDraft): OwnerDraftErrors {
  const errors: OwnerDraftErrors = {};
  if (!draft.fullName.trim()) errors.fullName = "Ingresa el nombre completo del titular.";
  if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) errors.email = "Ingresa un correo valido.";
  if (draft.phone && !/^[0-9+() .-]{1,40}$/.test(draft.phone)) errors.phone = "Usa solo numeros, espacios y simbolos telefonicos.";
  return errors;
}
