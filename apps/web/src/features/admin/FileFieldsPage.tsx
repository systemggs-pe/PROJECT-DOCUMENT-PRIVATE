import { useMemo, useState } from "react";
import { Edit3, LoaderCircle, Plus, Search, Trash2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { can, useCurrentIdentity } from "@/features/auth/authorization";
import { apiJson } from "@/lib/api";
import { describeMimeTypes, mimeOptions, type FileField } from "@/features/file-fields/file-field-model";
import { useFileFields } from "@/features/file-fields/useFileFields";

type Draft = {
  id?: string;
  label: string;
  description: string;
  required: boolean;
  acceptedMimeTypes: string[];
  maxFiles: number;
  maxFileSizeMb: number;
  isActive: boolean;
  sortOrder: number;
};

const emptyDraft: Draft = {
  label: "",
  description: "",
  required: false,
  acceptedMimeTypes: ["application/pdf"],
  maxFiles: 1,
  maxFileSizeMb: 3,
  isActive: true,
  sortOrder: 100,
};

const fileTypePresets = [
  { key: "pdf", label: "Solo PDF", values: ["application/pdf"] },
  { key: "image", label: "Imágenes", values: ["image/jpeg", "image/png", "image/webp"] },
] as const;

export default function FileFieldsPage() {
  const identity = useCurrentIdentity();
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [notice, setNotice] = useState("");
  const params = useMemo(() => {
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    if (source) query.set("source", source);
    if (status) query.set("status", status);
    const value = query.toString();
    return value ? `?${value}` : "";
  }, [search, source, status]);
  const fields = useFileFields(params);
  const canCreate = can(identity.data, "file_fields.create");
  const canUpdate = can(identity.data, "file_fields.update");
  const canDelete = can(identity.data, "file_fields.delete");

  const save = useMutation({
    mutationFn: (value: Draft) => {
      const payload = toPayload(value);
      return value.id ? apiJson<FileField>(`/file-fields/${value.id}`, { method: "PATCH", body: JSON.stringify(payload) }) : apiJson<FileField>("/file-fields", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      setNotice(draft.id ? "Campo actualizado." : "Campo creado.");
      setDraft(emptyDraft);
      void cache.invalidateQueries({ queryKey: ["file-fields"] });
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "No se pudo guardar el campo."),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiJson<{ deleted: boolean; deactivated: boolean }>(`/file-fields/${id}`, { method: "DELETE" }),
    onSuccess: (result) => {
      setNotice(result.deleted ? "Campo eliminado." : "Campo desactivado porque ya fue usado.");
      void cache.invalidateQueries({ queryKey: ["file-fields"] });
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : "No se pudo eliminar el campo."),
  });

  function edit(field: FileField) {
    setDraft({
      id: field.id,
      label: field.label,
      description: field.description ?? "",
      required: field.required,
      acceptedMimeTypes: field.acceptedMimeTypes.filter((mime) => mimeOptions.some((option) => option.value === mime)),
      maxFiles: field.maxFiles,
      maxFileSizeMb: Math.min(3, Math.max(1, Math.round(field.maxFileSize / 1024 / 1024))),
      isActive: field.isActive,
      sortOrder: field.sortOrder,
    });
    setNotice("");
  }

  if (fields.isPending) return <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando requisitos de archivos...</div>;
  if (fields.isError) return <section className="empty-state" role="alert"><h2>No se pudieron cargar los campos</h2><p>{fields.error.message}</p><Button onClick={() => void fields.refetch()}>Reintentar</Button></section>;

  return <div className="admin-page">
    <div className="page-heading">
      <div><p className="eyebrow">Ajustes</p><h2>Requisitos de archivos</h2><p className="page-subtitle">Crea opciones simples para pedir archivos en una plantilla.</p></div>
      <Button type="button" disabled={!canCreate} onClick={() => setDraft(emptyDraft)}><Plus className="mr-2 size-4" />Nuevo requisito</Button>
    </div>

    <section className="admin-toolbar">
      <label className="field search-field"><span>Buscar</span><div className="input-icon"><Search className="size-4" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o descripción" /></div></label>
      <label className="field"><span>Origen</span><select value={source} onChange={(event) => setSource(event.target.value)}><option value="">Todos</option><option value="SYSTEM">Del sistema</option><option value="CUSTOM">Personalizados</option></select></label>
      <label className="field"><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option><option value="ACTIVE">Activos</option><option value="INACTIVE">Inactivos</option></select></label>
    </section>

    <section className="settings-panel">
      <div className="section-heading"><div><p className="eyebrow">{draft.id ? "Editar" : "Crear"}</p><h3>{draft.id ? draft.label : "Nuevo requisito de archivo"}</h3></div></div>
      <div className="company-form-grid">
        <label className="field"><span>Nombre</span><input value={draft.label} maxLength={120} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label>
        <label className="field"><span>Ayuda para el usuario</span><input value={draft.description} maxLength={500} placeholder="Ejemplo: Adjunta el contrato firmado." onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label className="field"><span>Tipo de archivo</span><select value={presetForMimeTypes(draft.acceptedMimeTypes)} onChange={(event) => setDraft({ ...draft, acceptedMimeTypes: valuesForPreset(event.target.value) })}>{fileTypePresets.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
        <label className="field"><span>Máximo de archivos</span><input type="number" min={1} max={20} value={draft.maxFiles} onChange={(event) => setDraft({ ...draft, maxFiles: Number(event.target.value) })} /></label>
        <label className="field"><span>Tamaño por archivo</span><select value={draft.maxFileSizeMb} onChange={(event) => setDraft({ ...draft, maxFileSizeMb: Number(event.target.value) })}><option value={1}>1 MB</option><option value={2}>2 MB</option><option value={3}>3 MB</option></select></label>
      </div>
      <div className="form-flags"><label className="inline-check"><input type="checkbox" checked={draft.required} onChange={(event) => setDraft({ ...draft, required: event.target.checked })} />Obligatorio por defecto</label><label className="inline-check"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />Activo</label></div>
      <div className="form-actions"><Button variant="ghost" type="button" onClick={() => setDraft(emptyDraft)}>Cancelar</Button><Button type="button" disabled={save.isPending || !draft.label.trim() || draft.acceptedMimeTypes.length === 0 || (!draft.id && !canCreate) || (Boolean(draft.id) && !canUpdate)} onClick={() => save.mutate(draft)}>{save.isPending ? "Guardando..." : "Guardar requisito"}</Button></div>
      {notice && <p className="studio-error" role="status">{notice}</p>}
    </section>

    <section className="history-table file-fields-table" role="table" aria-label="Requisitos de archivos">
      <div className="history-head" role="row"><span>Nombre</span><span>Archivo permitido</span><span>Reglas</span><span>Estado</span><span>Acciones</span></div>
      {fields.data.items.map((field) => <div className="history-row" role="row" key={field.id}>
        <strong title={field.key}>{field.label}</strong>
        <span>{describeMimeTypes(field.acceptedMimeTypes)}</span>
        <span>{field.required ? "Obligatorio" : "Opcional"} · hasta {field.maxFiles} archivo(s) · {Math.round(field.maxFileSize / 1024 / 1024)} MB c/u</span>
        <span className={`status ${field.isActive ? "status-completed" : "status-failed"}`}>{field.isActive ? "Activo" : "Inactivo"}</span>
        <span className="history-actions"><Button variant="ghost" size="icon" title="Editar" aria-label={`Editar ${field.label}`} disabled={!canUpdate} onClick={() => edit(field)}><Edit3 className="size-4" /></Button><Button variant="ghost" size="icon" title="Eliminar o desactivar" aria-label={`Eliminar ${field.label}`} disabled={!canDelete || field.source === "SYSTEM" || remove.isPending} onClick={() => remove.mutate(field.id)}><Trash2 className="size-4" /></Button></span>
      </div>)}
    </section>
  </div>;
}

function presetForMimeTypes(values: string[]) {
  const normalized = [...values].sort().join("|");
  return fileTypePresets.find((preset) => [...preset.values].sort().join("|") === normalized)?.key ?? "pdf-word";
}

function valuesForPreset(key: string) {
  return [...(fileTypePresets.find((preset) => preset.key === key)?.values ?? fileTypePresets[0].values)];
}

function toPayload(draft: Draft) {
  return {
    label: draft.label.trim(),
    description: draft.description.trim() || null,
    required: draft.required,
    acceptedMimeTypes: draft.acceptedMimeTypes,
    maxFiles: draft.maxFiles,
    maxFileSize: draft.maxFileSizeMb * 1024 * 1024,
    isActive: draft.isActive,
    sortOrder: draft.sortOrder,
  };
}
