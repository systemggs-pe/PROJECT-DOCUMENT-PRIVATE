import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileOutput, ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ImageCaptureActions } from "@/components/ImageCaptureActions";
import { Button } from "@/components/ui/button";
import { apiJson, downloadGeneration } from "@/lib/api";
import type { Generation, TemplatePage } from "@/features/studio/model";
import { extractVariableKeys } from "./generation-model";

interface SelectedFile {
  id: string;
  originalName: string;
  previewUrl: string;
}

const maxFileBytes = 10 * 1024 * 1024;
const acceptedMimes = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function GeneratePage() {
  const cache = useQueryClient();
  const [templateId, setTemplateId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [files, setFiles] = useState<Record<string, SelectedFile>>({});
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<Generation | null>(null);
  const requestKey = useRef(crypto.randomUUID());
  const previewUrls = useRef(new Set<string>());
  const templates = useQuery({
    queryKey: ["generation", "templates"],
    queryFn: () => apiJson<TemplatePage>("/templates?page=1&pageSize=100&status=ACTIVE&sortBy=updatedAt&sortOrder=desc"),
    staleTime: 0,
  });
  const items = templates.data?.items ?? [];
  const selectedTemplate = items.find((item) => item.id === templateId) ?? items[0];
  const activeVersion = selectedTemplate?.versions.find((item) => item.isActive) ?? selectedTemplate?.versions[0];
  const selectedVersion = selectedTemplate?.versions.find((item) => item.id === versionId) ?? activeVersion;
  const slots = useMemo(() => selectedVersion?.elements.filter((element) => element.type === "IMAGE" && element.key) ?? [], [selectedVersion]);
  const variableKeys = useMemo(() => extractVariableKeys(selectedVersion?.elements ?? []), [selectedVersion]);

  useEffect(() => () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
  }, []);

  const uploadMutation = useMutation({
    mutationFn: async ({ key, file }: { key: string; file: File }) => {
      validateImage(file);
      const form = new FormData();
      form.append("file", file);
      const uploaded = await apiJson<{ id: string; originalName: string }>("/files", { method: "POST", body: form });
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      return { key, selected: { id: uploaded.id, originalName: uploaded.originalName, previewUrl } };
    },
    onSuccess: ({ key, selected }) => {
      setFiles((current) => {
        const previous = current[key];
        if (previous) revokePreview(previous.previewUrl, previewUrls.current);
        return { ...current, [key]: selected };
      });
      setMessage("");
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "No se pudo cargar la imagen."),
  });

  const generateMutation = useMutation({
    mutationFn: () => {
      if (!selectedTemplate || !selectedVersion) throw new Error("Selecciona una plantilla con version activa.");
      const missing = slots.filter((slot) => slot.required && !files[slot.key!]);
      if (missing.length > 0) throw new Error(`Carga: ${missing.map((slot) => slot.name).join(", ")}.`);
      return apiJson<Generation>("/generations", { method: "POST", body: JSON.stringify({ templateId: selectedTemplate.id, templateVersionId: selectedVersion.id, requestKey: requestKey.current, inputs: Object.fromEntries(Object.entries(files).map(([key, file]) => [key, { storedFileId: file.id }])), variables }) });
    },
    onSuccess: (generation) => {
      if (generation.status !== "COMPLETED") throw new Error(generation.errorMessage ?? "La generacion no termino correctamente.");
      setResult(generation);
      setMessage("");
      requestKey.current = crypto.randomUUID();
      void cache.invalidateQueries({ queryKey: ["studio", "generations"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "No se pudo generar el PDF."),
  });

  function selectTemplate(id: string) {
    setTemplateId(id);
    setVersionId("");
    setFiles({});
    setResult(null);
  }

  function removeFile(key: string) {
    const selected = files[key];
    if (selected) revokePreview(selected.previewUrl, previewUrls.current);
    setFiles((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  if (templates.isPending) return <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando plantillas activas...</div>;
  if (templates.isError) return <section className="empty-state" role="alert"><h2>No se pudieron cargar las plantillas</h2><p>{templates.error.message}</p><Button onClick={() => void templates.refetch()}>Reintentar</Button></section>;

  return <div className="generate-page">
    <div className="page-heading"><div><p className="eyebrow">Produccion documental</p><h2>Generar PDF</h2><p className="page-subtitle">Completa los campos de la version activa y conserva el documento numerado en tu historial.</p></div><FileOutput className="generate-heading-icon" aria-hidden={true} /></div>
    {!selectedTemplate ? <section className="empty-state"><FileOutput className="size-7" /><h3>No hay plantillas activas</h3><p>Activa una plantilla desde Plantillas para empezar a generar.</p></section> : <>
      <section className="generation-config" aria-label="Configuracion de generacion">
        <div className="generation-selects"><label className="field"><span>Plantilla</span><select value={selectedTemplate.id} onChange={(event) => selectTemplate(event.target.value)}>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>Version</span><select value={selectedVersion?.id ?? ""} onChange={(event) => { setVersionId(event.target.value); setFiles({}); setResult(null); }}>{selectedTemplate.versions.map((version) => <option key={version.id} value={version.id}>Version {version.versionNumber}{version.isActive ? " , activa" : ""}</option>)}</select></label></div>
        <div className="generation-config-meta"><span><strong>Formato</strong>{selectedVersion?.paperSize ?? "Sin version"} {selectedVersion?.orientation === "LANDSCAPE" ? "horizontal" : "vertical"}</span><span><strong>Campos de imagen</strong>{slots.length}</span></div>
      </section>
      <section className="generation-workspace">
        <div className="generation-inputs"><div className="section-heading"><div><p className="eyebrow">Campos de imagen</p><h3>Archivos del documento</h3></div><span className="section-count">{Object.keys(files).length}/{slots.length}</span></div>{slots.length ? <div className="generation-slots">{slots.map((slot) => { const selected = files[slot.key!]; return <div className={`generation-slot ${selected ? "is-filled" : ""}`} key={slot.id}><div className="slot-heading"><span><ImagePlus className="size-4" />{slot.name}{slot.required ? " *" : ""}</span>{selected && <Button variant="ghost" size="icon" title={`Quitar ${slot.name}`} aria-label={`Quitar ${slot.name}`} onClick={() => removeFile(slot.key!)}><Trash2 className="size-4" /></Button>}</div>{selected ? <div className="slot-selected"><img src={selected.previewUrl} alt={`Vista previa de ${slot.name}`} /><span title={selected.originalName}>{selected.originalName}</span></div> : <p className="slot-empty">Aun no has seleccionado una imagen.</p>}<ImageCaptureActions fileLabel={selected ? "Reemplazar imagen" : "Seleccionar imagen"} onSelect={(file) => uploadMutation.mutate({ key: slot.key!, file })} /></div>; })}</div> : <p className="panel-hint">Esta version no tiene campos de imagen. Puedes generar el PDF usando solo sus textos y formas.</p>}</div>
        <div className="generation-inputs"><div className="section-heading"><div><p className="eyebrow">Datos variables</p><h3>Texto del documento</h3></div><span className="section-count">{variableKeys.length}</span></div>{variableKeys.length ? <div className="variable-list">{variableKeys.map((key) => <label className="field" key={key}><span>{humanizeKey(key)}</span><input value={variables[key] ?? ""} maxLength={500} placeholder={`Valor para ${key}`} onChange={(event) => setVariables((current) => ({ ...current, [key]: event.target.value }))} /></label>)}</div> : <p className="panel-hint">No hay variables de texto en esta version.</p>}</div>
      </section>
      {message && <p className="studio-error" role="alert">{message}</p>}
      <div className="generation-actions"><Button onClick={() => { setMessage(""); generateMutation.mutate(); }} disabled={generateMutation.isPending || uploadMutation.isPending || !selectedVersion}><LoaderCircle className={`mr-2 size-4 ${generateMutation.isPending ? "animate-spin" : "hidden"}`} />Generar documento</Button><span className="generation-action-hint">El PDF se guarda en archivos privados y recibe un correlativo único.</span></div>
      {result && <section className="generation-result" role="status"><div><p className="eyebrow">Documento listo</p><h3>{result.number}</h3><p>La generación se completó con la versión {selectedVersion?.versionNumber} de {selectedTemplate.name}.</p></div><Button onClick={() => void downloadGeneration(result.id, `${result.number}.pdf`)}><Download className="mr-2 size-4" />Descargar PDF</Button></section>}
    </>}
  </div>;
}

function validateImage(file: File) {
  if (!acceptedMimes.has(file.type)) throw new Error("Selecciona una imagen JPG, PNG o WebP.");
  if (file.size > maxFileBytes) throw new Error("La imagen supera el limite de 10 MB.");
}

function revokePreview(url: string, urls: Set<string>) {
  URL.revokeObjectURL(url);
  urls.delete(url);
}

function humanizeKey(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
