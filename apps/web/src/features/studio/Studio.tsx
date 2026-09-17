import { useMemo, useState } from "react";
import { Archive, ChevronLeft, ChevronRight, Copy, FilePlus2, ImagePlus, LoaderCircle, Pencil, Plus, RotateCcw, Sparkles } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageCaptureActions } from "@/components/ImageCaptureActions";
import { ImageCropEditor } from "@/components/ImageCropEditor";
import { Button } from "@/components/ui/button";
import { apiFetch, apiJson } from "@/lib/api";
import Editor from "./Editor";
import { newDraft, toVersionDraft } from "./model";
import type { Draft, Generation, Template, TemplatePage, Version } from "./model";

interface StoredFile { id: string; originalName: string; mimeType: string; sizeBytes: string; type: "IMAGE" | "PDF" }

function goToTemplateRoute(path: string) {
  if (window.location.pathname !== path) window.history.pushState(null, "", path);
}

export default function Studio() {
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "ACTIVE" | "DRAFT" | "ARCHIVED">("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ template: Template; version: Version } | null>(null);
  const [newMode, setNewMode] = useState<"blank" | "example" | null>(() => window.location.pathname === "/templates/new" ? "blank" : null);
  const [selectedId, setSelectedId] = useState(() => templateIdFromPath(window.location.pathname));
  const [notice, setNotice] = useState("");
  const [editorKey, setEditorKey] = useState(0);
  const templates = useQuery({
    queryKey: ["studio", "templates", search, status, page],
    queryFn: () => apiJson<TemplatePage>(`/templates?page=${page}&pageSize=10&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ""}`),
    staleTime: 0,
  });
  const items = templates.data?.items ?? [];
  const selected = items.find((template) => template.id === selectedId) ?? items[0];
  const createMutation = useMutation({
    mutationFn: async (draft: Draft) => apiJson<Template>("/templates", { method: "POST", body: JSON.stringify(draft) }),
    onSuccess: (template) => { void cache.invalidateQueries({ queryKey: ["studio", "templates"] }); setSelectedId(template.id); setEditing(null); setNewMode(null); goToTemplateRoute(`/templates/${template.id}`); setNotice("Plantilla guardada como version 1."); },
  });
  const updateMutation = useMutation({
    mutationFn: async ({ id, draft }: { id: string; draft: Draft }) => apiJson<Template>(`/templates/${id}`, { method: "PUT", body: JSON.stringify(draft) }),
    onSuccess: (template) => { void cache.invalidateQueries({ queryKey: ["studio", "templates"] }); setSelectedId(template.id); setEditing(null); goToTemplateRoute(`/templates/${template.id}`); setNotice(`Nueva version ${template.versions[0]?.versionNumber ?? ""} guardada.`); },
  });
  const versionSaveMutation = useMutation({
    mutationFn: async ({ template, version, draft }: { template: Template; version: Version; draft: Draft }) => {
      if (template.name !== draft.name || (template.description ?? "") !== draft.description) {
        await apiJson<Template>(`/templates/${template.id}`, { method: "PATCH", body: JSON.stringify({ name: draft.name, description: draft.description }) });
      }
      return apiJson<Version>(`/templates/${template.id}/versions/${version.id}`, { method: "PUT", body: JSON.stringify(versionPayload(draft)) });
    },
    onSuccess: (version, variables) => {
      void cache.invalidateQueries({ queryKey: ["studio", "templates"] });
      setEditing(null);
      setSelectedId(variables.template.id);
      goToTemplateRoute(`/templates/${variables.template.id}`);
      setNotice(`Version ${version.versionNumber} guardada.`);
    },
  });
  const statusMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "archive" | "restore" }) => apiJson<Template>(`/templates/${id}/${action}`, { method: "POST" }),
    onSuccess: (_, variables) => { void cache.invalidateQueries({ queryKey: ["studio", "templates"] }); setNotice(variables.action === "archive" ? "Plantilla archivada." : "Plantilla restaurada."); },
  });
  const versionMutation = useMutation({
    mutationFn: async ({ templateId, versionId, action }: { templateId: string; versionId: string; action: "activate" | "duplicate" }) => apiJson<Version>(`/templates/${templateId}/versions/${versionId}/${action}`, { method: "POST" }),
    onSuccess: (version, variables) => { void cache.invalidateQueries({ queryKey: ["studio", "templates"] }); setNotice(variables.action === "activate" ? "Version activada." : "Version duplicada como borrador."); if (variables.action === "duplicate" && selected) { setEditing({ template: selected, version }); goToTemplateRoute(`/templates/${selected.id}/versions/${version.id}/edit`); } },
  });
  const route = selected ? versionRouteFromPath(window.location.pathname) : null;
  const routeEditing = selected && route && route.templateId === selected.id ? selected.versions.find((version) => version.id === route.versionId) : null;
  const activeEditing = editing ?? (selected && routeEditing ? { template: selected, version: routeEditing } : null);
  if (activeEditing || newMode) {
    const initial = activeEditing ? toVersionDraft(activeEditing.template, activeEditing.version) : newDraft(newMode === "example");
    return <Editor key={`${activeEditing?.version.id ?? newMode}-${editorKey}`} initial={initial} context={activeEditing ? { versionNumber: activeEditing.version.versionNumber, isActive: activeEditing.version.isActive } : undefined} saving={createMutation.isPending || updateMutation.isPending || versionSaveMutation.isPending || versionMutation.isPending} error={createMutation.error?.message ?? updateMutation.error?.message ?? versionSaveMutation.error?.message ?? versionMutation.error?.message ?? ""} onBack={() => { setEditing(null); setNewMode(null); goToTemplateRoute("/templates"); }} onDuplicate={activeEditing ? () => versionMutation.mutate({ templateId: activeEditing.template.id, versionId: activeEditing.version.id, action: "duplicate" }) : undefined} onSave={(draft) => activeEditing ? versionSaveMutation.mutate({ template: activeEditing.template, version: activeEditing.version, draft }) : createMutation.mutate(draft)} />;
  }
  if (templates.isPending) return <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando plantillas...</div>;
  if (templates.isError) return <section className="empty-state" role="alert"><h2>No se pudieron cargar las plantillas</h2><p>{templates.error.message}</p><Button onClick={() => void templates.refetch()}>Reintentar</Button></section>;
  return <div className="studio-page">
    <div className="page-heading"><div><p className="eyebrow">Biblioteca de documentos</p><h2>Plantillas</h2><p className="page-subtitle">Diseña una vez, completa los campos y conserva cada version.</p></div><div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={() => { setNewMode("example"); setNotice(""); goToTemplateRoute("/templates/new"); }}><Sparkles className="mr-2 size-4" />Ejemplo DNI + Foto</Button><Button onClick={() => { setNewMode("blank"); setNotice(""); goToTemplateRoute("/templates/new"); }}><Plus className="mr-2 size-4" />Nueva plantilla</Button></div></div>
    <div className="template-filters"><label className="field"><span>Buscar</span><input value={search} placeholder="Nombre o descripcion" onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><label className="field"><span>Estado</span><select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }}><option value="">Todos</option><option value="ACTIVE">Activas</option><option value="DRAFT">Borradores</option><option value="ARCHIVED">Archivadas</option></select></label></div>
    {notice && <p className="studio-success" role="status">{notice}</p>}
    {!items.length ? <section className="empty-state"><FilePlus2 className="size-7" /><h3>{search || status ? "No hay coincidencias" : "Aun no hay plantillas"}</h3><p>{search || status ? "Prueba otro filtro para encontrar una plantilla." : "Empieza con el ejemplo de tres imagenes o crea una hoja en blanco."}</p>{!search && !status && <Button onClick={() => setNewMode("example")}><Sparkles className="mr-2 size-4" />Abrir ejemplo</Button>}</section> : <div className="template-list">
      {items.map((template) => <article className={`template-row ${template.id === selected?.id ? "is-selected" : ""}`} key={template.id}>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setSelectedId(template.id); goToTemplateRoute(`/templates/${template.id}`); }}><span className="template-name">{template.name}</span><span className="template-description">{template.description || "Sin descripcion"}</span></button>
        <div className="template-meta"><span>{template.versions.length} version{template.versions.length === 1 ? "" : "es"}</span><span>{template.status === "ACTIVE" ? "Activa" : template.status === "ARCHIVED" ? "Archivada" : "Borrador"}</span></div>
        <div className="flex items-center gap-1"><Button variant="ghost" size="icon" title="Editar version activa" aria-label="Editar version activa" onClick={() => { const version = template.versions.find((item) => item.isActive) ?? template.versions[0]; if (version) { setEditing({ template, version }); setNotice(""); setEditorKey((key) => key + 1); goToTemplateRoute(`/templates/${template.id}/versions/${version.id}/edit`); } }}><Pencil className="size-4" /></Button>{template.status === "ARCHIVED" ? <Button variant="ghost" size="icon" title="Restaurar plantilla" aria-label="Restaurar plantilla" onClick={() => statusMutation.mutate({ id: template.id, action: "restore" })}><RotateCcw className="size-4" /></Button> : <Button variant="ghost" size="icon" title="Archivar plantilla" aria-label="Archivar plantilla" onClick={() => { if (window.confirm("Archivar esta plantilla?")) statusMutation.mutate({ id: template.id, action: "archive" }); }}><Archive className="size-4" /></Button>}</div>
      </article>)}
    </div>}
    {templates.data && templates.data.totalPages > 1 && <nav className="pagination" aria-label="Paginacion de plantillas"><Button variant="ghost" size="icon" aria-label="Pagina anterior" title="Pagina anterior" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft className="size-4" /></Button><span>Pagina {page} de {templates.data.totalPages}</span><Button variant="ghost" size="icon" aria-label="Pagina siguiente" title="Pagina siguiente" disabled={page >= templates.data.totalPages} onClick={() => setPage((value) => value + 1)}><ChevronRight className="size-4" /></Button></nav>}
    {selected && <TemplateDetail template={selected} onEdit={(version) => { setEditing({ template: selected, version }); setNotice(""); setEditorKey((key) => key + 1); goToTemplateRoute(`/templates/${selected.id}/versions/${version.id}/edit`); }} onVersionAction={(versionId, action) => versionMutation.mutate({ templateId: selected.id, versionId, action })} />}
    {selected?.status === "ACTIVE" && <GenerationPanel template={selected} onGenerated={() => { void cache.invalidateQueries({ queryKey: ["studio", "generations"] }); setNotice("Documento generado y guardado en el historial."); }} />}
  </div>;
}

function TemplateDetail({ template, onEdit, onVersionAction }: { template: Template; onEdit: (version: Version) => void; onVersionAction: (versionId: string, action: "activate" | "duplicate") => void }) {
  const activeVersion = template.activeVersion ?? template.versions.find((version) => version.isActive) ?? template.versions[0];
  return <section className="template-detail"><div className="detail-heading"><div><p className="eyebrow">Detalle de plantilla</p><h3>{template.name}</h3><p>{template.description || "Sin descripcion"}</p></div>{activeVersion && <Button variant="ghost" onClick={() => onEdit(activeVersion)}><Pencil className="mr-2 size-4" />Editar version activa</Button>}</div><div className="detail-summary"><span><strong>Estado</strong>{template.status === "ACTIVE" ? "Activa" : template.status === "ARCHIVED" ? "Archivada" : "Borrador"}</span><span><strong>Version activa</strong>{activeVersion?.versionNumber ?? "Ninguna"}</span><span><strong>Formato</strong>{activeVersion?.paperSize ?? "A4"}</span></div><div className="version-list"><div className="version-list-head"><strong>Historial de versiones</strong><span>{template.versions.length} total</span></div>{template.versions.map((version) => <div className="version-row" key={version.id}><span><strong>Version {version.versionNumber}</strong><small>{version.paperSize} - {version.orientation === "PORTRAIT" ? "Vertical" : "Horizontal"} - {version.elements.length} elementos</small></span><span className={version.isActive ? "status-pill is-active" : "status-pill"}>{version.isActive ? "Activa" : "Borrador"}</span><div className="version-actions"><Button variant="ghost" size="icon" title="Editar esta version" aria-label="Editar esta version" onClick={() => onEdit(version)}><Pencil className="size-4" /></Button>{!version.isActive && template.status === "ACTIVE" && <Button variant="ghost" size="icon" title="Activar version" aria-label="Activar version" onClick={() => onVersionAction(version.id, "activate")}><RotateCcw className="size-4" /></Button>}<Button variant="ghost" size="icon" title="Duplicar version" aria-label="Duplicar version" onClick={() => onVersionAction(version.id, "duplicate")}><Copy className="size-4" /></Button></div></div>)}</div></section>;
}

function templateIdFromPath(pathname: string) {
  return pathname.match(/^\/templates\/([^/]+)/)?.[1] ?? "";
}

function versionRouteFromPath(pathname: string) {
  const match = pathname.match(/^\/templates\/([^/]+)\/versions\/([^/]+)\/edit$/);
  return match ? { templateId: match[1]!, versionId: match[2]! } : null;
}

function versionPayload(draft: Draft) {
  return {
    paperSize: draft.paperSize, orientation: draft.orientation, width: draft.width, height: draft.height,
    marginTop: draft.marginTop, marginRight: draft.marginRight, marginBottom: draft.marginBottom, marginLeft: draft.marginLeft,
    pageCount: draft.pageCount, elements: draft.elements,
  };
}

function GenerationPanel({ template, onGenerated }: { template: Template; onGenerated: () => void }) {
  const version = template.versions.find((item) => item.isActive) ?? template.versions[0];
  const slots = useMemo(() => version?.elements.filter((item) => item.type === "IMAGE") ?? [], [version]);
  const [files, setFiles] = useState<Record<string, StoredFile>>({});
  const [pendingImage, setPendingImage] = useState<{ key: string; file: File; label: string } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!version) return null;
  const activeVersion = version;
  function handleSelectedImage(key: string, label: string, file: File | undefined) {
    if (!file) return;
    setMessage("");
    setPendingImage({ key, file, label });
  }
  async function uploadImage(key: string, file: File) {
    if (!file) return;
    setMessage(""); setBusy(true);
    try {
      const form = new FormData(); form.append("file", file);
      const response = await apiFetch("/files", { method: "POST", body: form });
      if (!response.ok) { const error = await response.json().catch(() => ({})) as { error?: { message?: string } }; throw new Error(error.error?.message ?? "No se pudo cargar la imagen."); }
      const uploaded = await response.json() as StoredFile;
      setFiles((current) => ({ ...current, [key]: uploaded }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo cargar la imagen."); }
    finally { setBusy(false); }
  }
  async function generate() {
    setMessage("");
    const missing = slots.filter((slot) => slot.required && (!slot.key || !files[slot.key]));
    if (missing.length) { setMessage("Carga todas las imagenes obligatorias antes de generar."); return; }
    setBusy(true);
    try {
      const generation = await apiJson<Generation>("/generations", { method: "POST", body: JSON.stringify({ templateVersionId: activeVersion.id, requestKey: crypto.randomUUID(), inputs: Object.entries(files).map(([key, file]) => ({ key, fileId: file.id })) }) });
      if (generation.status !== "COMPLETED") throw new Error(generation.errorMessage ?? "La generacion no termino correctamente.");
      setMessage(`${generation.number} listo para descargar desde Generaciones.`); onGenerated();
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo generar el documento."); }
    finally { setBusy(false); }
  }
  return <section className="generation-panel"><div><p className="eyebrow">Probar plantilla</p><h3>Generar documento</h3><p className="text-sm text-[var(--muted)]">Version {activeVersion.versionNumber}, {slots.length} campo{slots.length === 1 ? "" : "s"} de imagen.</p></div><div className="slot-grid">{slots.map((slot) => <div className="upload-slot" key={slot.id}><span><ImagePlus className="size-4" />{slot.name}{slot.required ? " *" : ""}</span><ImageCaptureActions disabled={busy} onSelect={(file) => handleSelectedImage(slot.key ?? slot.id, slot.name, file)} /><small>{slot.key && files[slot.key] ? files[slot.key]?.originalName : "PNG, JPG o WebP, maximo 10 MB"}</small></div>)}</div>{message && <p className={message.includes("listo") ? "studio-success" : "studio-error"} role="status">{message}</p>}<Button onClick={() => void generate()} disabled={busy}><LoaderCircle className={`mr-2 size-4 ${busy ? "animate-spin" : "hidden"}`} />Generar PDF</Button>{pendingImage && <ImageCropEditor file={pendingImage.file} contextName={pendingImage.label} onCancel={() => setPendingImage(null)} onApply={(file) => { const key = pendingImage.key; setPendingImage(null); void uploadImage(key, file); }} />}</section>;
}
