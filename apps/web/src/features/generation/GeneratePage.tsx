import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, FileOutput, FileText, ImagePlus, LoaderCircle, Paperclip, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ImageCaptureActions } from "@/components/ImageCaptureActions";
import { ImageCropEditor } from "@/components/ImageCropEditor";
import { Button } from "@/components/ui/button";
import { apiFetch, apiJson, downloadFile, downloadGeneration } from "@/lib/api";
import type { Generation, TemplatePage } from "@/features/studio/model";
import { extractVariableKeys } from "./generation-model";
import type { FilePage, StoredFile } from "@/features/files/file-model";

interface SelectedFile {
  id: string;
  originalName: string;
  previewUrl: string;
}

type AttachmentFile = Pick<StoredFile, "id" | "originalName" | "type" | "mimeType" | "sizeBytes">;

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
  const [cropTarget, setCropTarget] = useState<{ key: string; file: File } | null>(null);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [previewUrl, setPreviewUrl] = useState("");
  const requestKey = useRef(crypto.randomUUID());
  const previewUrls = useRef(new Set<string>());
  const pdfPreviewUrl = useRef("");

  const templates = useQuery({
    queryKey: ["generation", "templates"],
    queryFn: () => apiJson<TemplatePage>("/templates?page=1&pageSize=100&status=ACTIVE&sortBy=updatedAt&sortOrder=desc"),
    staleTime: 0,
  });
  const libraryFiles = useQuery({
    queryKey: ["generation", "attachment-files"],
    queryFn: () => apiJson<FilePage>("/files?page=1&pageSize=50&sortBy=createdAt&sortOrder=desc"),
    staleTime: 15_000,
  });
  const items = templates.data?.items ?? [];
  const selectedTemplate = items.find((item) => item.id === templateId) ?? items[0];
  const activeVersion = selectedTemplate?.versions.find((item) => item.isActive) ?? selectedTemplate?.versions[0];
  const selectedVersion = selectedTemplate?.versions.find((item) => item.id === versionId) ?? activeVersion;
  const slots = useMemo(() => selectedVersion?.elements.filter((element) => element.type === "IMAGE" && element.key) ?? [], [selectedVersion]);
  const variableKeys = useMemo(() => extractVariableKeys(selectedVersion?.elements ?? []), [selectedVersion]);

  useEffect(() => () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    if (pdfPreviewUrl.current) URL.revokeObjectURL(pdfPreviewUrl.current);
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
      closePreview();
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "No se pudo cargar la imagen."),
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch("/generations/preview", {
        method: "POST",
        body: JSON.stringify(buildGenerationPayload()),
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { message?: string | string[]; error?: { message?: string } };
        const responseMessage = data.error?.message ?? data.message;
        throw new Error(Array.isArray(responseMessage) ? responseMessage.join(" ") : responseMessage ?? "No se pudo previsualizar el PDF.");
      }
      return response.blob();
    },
    onSuccess: (blob) => {
      closePreview();
      const nextUrl = URL.createObjectURL(blob);
      pdfPreviewUrl.current = nextUrl;
      setPreviewUrl(nextUrl);
      setMessage("");
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "No se pudo previsualizar el PDF."),
  });

  const generateMutation = useMutation({
    mutationFn: () => apiJson<Generation>("/generations", { method: "POST", body: JSON.stringify(buildGenerationPayload()) }),
    onSuccess: (generation) => {
      if (generation.status !== "COMPLETED") throw new Error(generation.errorMessage ?? "La generacion no termino correctamente.");
      setResult(generation);
      setMessage("");
      requestKey.current = crypto.randomUUID();
      void cache.invalidateQueries({ queryKey: ["studio", "generations"] });
      void downloadGeneration(generation.id, `${generation.number}.pdf`).catch(() => setMessage("El documento esta listo, pero no se pudo iniciar la descarga automatica."));
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "No se pudo generar el PDF."),
  });

  function selectTemplate(id: string) {
    setTemplateId(id);
    setVersionId("");
    setFiles({});
    setAttachments([]);
    setResult(null);
    closePreview();
  }

  function removeFile(key: string) {
    const selected = files[key];
    if (selected) revokePreview(selected.previewUrl, previewUrls.current);
    setFiles((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    closePreview();
  }

  function addAttachment(file: AttachmentFile) {
    if (file.type !== "PDF" && file.type !== "DOCUMENT") {
      setMessage("Solo puedes anexar PDF, DOC o DOCX.");
      return;
    }
    setAttachments((current) => current.some((item) => item.id === file.id) ? current : [...current, file]);
    setMessage("");
    closePreview();
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((item) => item.id !== id));
    closePreview();
  }

  function moveAttachment(id: string, direction: -1 | 1) {
    setAttachments((current) => {
      const index = current.findIndex((item) => item.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const currentItem = next[index];
      const targetItem = next[nextIndex];
      if (!currentItem || !targetItem) return current;
      next[index] = targetItem;
      next[nextIndex] = currentItem;
      return next;
    });
    closePreview();
  }

  function buildGenerationPayload() {
    if (!selectedTemplate || !selectedVersion) throw new Error("Selecciona una plantilla con version activa.");
    const missing = slots.filter((slot) => slot.required && !files[slot.key!]);
    if (missing.length > 0) throw new Error(`Carga: ${missing.map((slot) => slot.name).join(", ")}.`);
    return {
      templateId: selectedTemplate.id,
      templateVersionId: selectedVersion.id,
      requestKey: requestKey.current,
      inputs: Object.fromEntries(Object.entries(files).map(([key, file]) => [key, { storedFileId: file.id }])),
      attachments: attachments.map((file, index) => ({ fileId: file.id, order: index })),
      variables,
    };
  }

  function closePreview() {
    if (pdfPreviewUrl.current) {
      URL.revokeObjectURL(pdfPreviewUrl.current);
      pdfPreviewUrl.current = "";
    }
    setPreviewUrl("");
  }

  if (templates.isPending) return <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando plantillas activas...</div>;
  if (templates.isError) return <section className="empty-state" role="alert"><h2>No se pudieron cargar las plantillas</h2><p>{templates.error.message}</p><Button onClick={() => void templates.refetch()}>Reintentar</Button></section>;

  return (
    <div className="generate-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Produccion documental</p>
          <h2>Generar PDF</h2>
          <p className="page-subtitle">Completa los campos de la version activa y conserva el documento numerado en tu historial.</p>
        </div>
        <FileOutput className="generate-heading-icon" aria-hidden={true} />
      </div>

      {!selectedTemplate ? (
        <section className="empty-state"><FileOutput className="size-7" /><h3>No hay plantillas activas</h3><p>Activa una plantilla desde Plantillas para empezar a generar.</p></section>
      ) : (
        <>
          <section className="generation-config" aria-label="Configuracion de generacion">
            <div className="generation-selects">
              <label className="field">
                <span>Plantilla</span>
                <select value={selectedTemplate.id} onChange={(event) => selectTemplate(event.target.value)}>
                  {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Version</span>
                <select value={selectedVersion?.id ?? ""} onChange={(event) => { setVersionId(event.target.value); setFiles({}); setResult(null); closePreview(); }}>
                  {selectedTemplate.versions.map((version) => <option key={version.id} value={version.id}>Version {version.versionNumber}{version.isActive ? " , activa" : ""}</option>)}
                </select>
              </label>
            </div>
            <div className="generation-config-meta">
              <span><strong>Formato</strong>{selectedVersion?.paperSize ?? "Sin version"} {selectedVersion?.orientation === "LANDSCAPE" ? "horizontal" : "vertical"}</span>
              <span><strong>Campos de imagen</strong>{slots.length}</span>
            </div>

            <div className="generation-inputs">
              <div className="section-heading">
                <div><p className="eyebrow">Adjuntos</p><h3>PDFs anexos</h3></div>
                <span className="section-count">{attachments.length}</span>
              </div>
              {attachments.length ? (
                <div className="attachment-list">
                  {attachments.map((file, index) => (
                    <div className="attachment-row" key={file.id}>
                      <span><Paperclip className="size-4" />{index + 1}. {file.originalName}</span>
                      <div className="file-actions">
                        <Button variant="ghost" size="icon" title="Subir orden" aria-label={`Subir ${file.originalName}`} disabled={index === 0} onClick={() => moveAttachment(file.id, -1)}><ArrowUp className="size-4" /></Button>
                        <Button variant="ghost" size="icon" title="Bajar orden" aria-label={`Bajar ${file.originalName}`} disabled={index === attachments.length - 1} onClick={() => moveAttachment(file.id, 1)}><ArrowDown className="size-4" /></Button>
                        <Button variant="ghost" size="icon" title="Descargar" aria-label={`Descargar ${file.originalName}`} onClick={() => void downloadFile(file.id, file.originalName)}><Download className="size-4" /></Button>
                        <Button variant="ghost" size="icon" title="Quitar" aria-label={`Quitar ${file.originalName}`} onClick={() => removeAttachment(file.id)}><Trash2 className="size-4" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="panel-hint">Opcional: agrega PDFs, DOC o DOCX de tu biblioteca para unirlos despues del documento principal.</p>}
              <div className="attachment-picker">
                {libraryFiles.isPending ? <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando biblioteca...</div> : libraryFiles.isError ? <p className="studio-error" role="alert">{libraryFiles.error.message}</p> : attachmentCandidates(libraryFiles.data?.items ?? []).length ? attachmentCandidates(libraryFiles.data?.items ?? []).map((file) => {
                  const selected = attachments.some((item) => item.id === file.id);
                  return <button className="attachment-option" type="button" key={file.id} disabled={selected} onClick={() => addAttachment(file)} title={file.originalName}><FileText className="size-4" /><span>{file.originalName}</span><small>{selected ? "Agregado" : file.type === "PDF" ? "Agregar PDF" : "Convertir y anexar"}</small></button>;
                }) : <p className="panel-hint">No hay PDFs o documentos en tu biblioteca. Sube uno desde Archivos para usarlo como anexo.</p>}
              </div>
              <p className="panel-hint">Los DOC/DOCX se convierten a PDF en backend antes de anexarse. Si LibreOffice no esta configurado en el servidor, la generacion mostrara un error claro.</p>
            </div>
          </section>

          <section className="generation-workspace">
            <div className="generation-inputs">
              <div className="section-heading">
                <div><p className="eyebrow">Campos de imagen</p><h3>Archivos del documento</h3></div>
                <span className="section-count">{Object.keys(files).length}/{slots.length}</span>
              </div>
              {slots.length ? (
                <div className="generation-slots">
                  {slots.map((slot) => {
                    const selected = files[slot.key!];
                    return (
                      <div className={`generation-slot ${selected ? "is-filled" : ""}`} key={slot.id}>
                        <div className="slot-heading">
                          <span><ImagePlus className="size-4" />{slot.name}{slot.required ? " *" : ""}</span>
                          {selected && <Button variant="ghost" size="icon" title={`Quitar ${slot.name}`} aria-label={`Quitar ${slot.name}`} onClick={() => removeFile(slot.key!)}><Trash2 className="size-4" /></Button>}
                        </div>
                        {selected ? <div className="slot-selected"><img src={selected.previewUrl} alt={`Vista previa de ${slot.name}`} /><span title={selected.originalName}>{selected.originalName}</span></div> : <p className="slot-empty">Aun no has seleccionado una imagen.</p>}
                        <ImageCaptureActions fileLabel={selected ? "Reemplazar imagen" : "Seleccionar imagen"} disabled={uploadMutation.isPending} onSelect={(file) => setCropTarget({ key: slot.key!, file })} />
                      </div>
                    );
                  })}
                </div>
              ) : <p className="panel-hint">Esta version no tiene campos de imagen. Puedes generar el PDF usando solo sus textos y formas.</p>}
            </div>

            <div className="generation-inputs">
              <div className="section-heading">
                <div><p className="eyebrow">Datos variables</p><h3>Texto del documento</h3></div>
                <span className="section-count">{variableKeys.length}</span>
              </div>
              {variableKeys.length ? (
                <div className="variable-list">
                  {variableKeys.map((key) => (
                    <label className="field" key={key}>
                      <span>{humanizeKey(key)}</span>
                      <input value={variables[key] ?? ""} maxLength={500} placeholder={`Valor para ${key}`} onChange={(event) => { closePreview(); setVariables((current) => ({ ...current, [key]: event.target.value })); }} />
                    </label>
                  ))}
                </div>
              ) : <p className="panel-hint">No hay variables de texto en esta version.</p>}
            </div>
          </section>

          {message && <p className="studio-error" role="alert">{message}</p>}
          <div className="generation-actions">
            <Button variant="ghost" onClick={() => { setMessage(""); previewMutation.mutate(); }} disabled={previewMutation.isPending || generateMutation.isPending || uploadMutation.isPending || !selectedVersion}>
              <LoaderCircle className={`mr-2 size-4 ${previewMutation.isPending ? "animate-spin" : "hidden"}`} />
              Previsualizar
            </Button>
            <Button onClick={() => { setMessage(""); generateMutation.mutate(); }} disabled={generateMutation.isPending || previewMutation.isPending || uploadMutation.isPending || !selectedVersion}>
              <LoaderCircle className={`mr-2 size-4 ${generateMutation.isPending ? "animate-spin" : "hidden"}`} />
              Generar documento
            </Button>
            <span className="generation-action-hint">El PDF se guarda en archivos privados y recibe un correlativo unico.</span>
          </div>

          {previewUrl && <section className="generation-preview"><div className="section-heading"><div><p className="eyebrow">Preview</p><h3>Previsualizacion del PDF</h3></div><Button type="button" variant="ghost" onClick={closePreview}>Cerrar preview</Button></div><iframe src={previewUrl} title="Previsualizacion del PDF generado" /></section>}
          {result && <section className="generation-result" role="status"><div><p className="eyebrow">Documento listo</p><h3>{result.number}</h3><p>La generacion se completo con la version {selectedVersion?.versionNumber} de {selectedTemplate.name}.</p></div><Button onClick={() => void downloadGeneration(result.id, `${result.number}.pdf`)}><Download className="mr-2 size-4" />Descargar PDF</Button></section>}
          {cropTarget && <ImageCropEditor file={cropTarget.file} onCancel={() => setCropTarget(null)} onApply={(file) => { const key = cropTarget.key; setCropTarget(null); closePreview(); uploadMutation.mutate({ key, file }); }} />}
        </>
      )}
    </div>
  );
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

function attachmentCandidates(files: StoredFile[]): AttachmentFile[] {
  return files.filter((file) => file.type === "PDF" || file.type === "DOCUMENT").map((file) => ({ id: file.id, originalName: file.originalName, type: file.type, mimeType: file.mimeType, sizeBytes: file.sizeBytes }));
}
