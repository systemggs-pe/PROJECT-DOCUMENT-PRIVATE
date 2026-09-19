import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, FileOutput, FileText, ImagePlus, LoaderCircle, Paperclip, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ImageCaptureActions } from "@/components/ImageCaptureActions";
import { ImageCropEditor } from "@/components/ImageCropEditor";
import { PdfViewer } from "@/components/PdfViewer";
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
  const [fieldFiles, setFieldFiles] = useState<Record<string, AttachmentFile[]>>({});
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewStale, setPreviewStale] = useState(false);
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
  const fileSlots = useMemo(() => selectedVersion?.elements.filter((element) => element.type === "FILE" && element.key) ?? [], [selectedVersion]);
  const variableKeys = useMemo(() => extractVariableKeys(selectedVersion?.elements ?? []), [selectedVersion]);

  useEffect(() => () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    if (pdfPreviewUrl.current) URL.revokeObjectURL(pdfPreviewUrl.current);
  }, []);

  const uploadMutation = useMutation({
    mutationFn: async ({ key, file, fileFieldId }: { key: string; file: File; fileFieldId?: string | null | undefined }) => {
      validateImage(file);
      const form = new FormData();
      form.append("file", file);
      if (fileFieldId) form.append("fileFieldId", fileFieldId);
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
      markPreviewStale();
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "No se pudo cargar la imagen."),
  });
  const fieldUploadMutation = useMutation({
    mutationFn: async ({ key, file, slot }: { key: string; file: File; slot: NonNullable<typeof selectedVersion>["elements"][number] }) => {
      validateFieldUpload(file, slot.properties);
      const form = new FormData();
      form.append("file", file);
      if (slot.fileFieldId) form.append("fileFieldId", slot.fileFieldId);
      const uploaded = await apiJson<StoredFile>("/files", { method: "POST", body: form });
      return { key, file: toAttachmentFile(uploaded), maxFiles: fieldMaxFiles(slot) };
    },
    onSuccess: ({ key, file, maxFiles }) => {
      selectFieldFile(key, file, maxFiles);
      void cache.invalidateQueries({ queryKey: ["generation", "attachment-files"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "No se pudo cargar el archivo."),
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
      setPreviewStale(false);
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
    setFieldFiles({});
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
    markPreviewStale();
  }

  function addAttachment(file: AttachmentFile) {
    if (file.type !== "PDF" && file.type !== "DOCUMENT") {
      setMessage("Solo puedes anexar PDF, DOC o DOCX.");
      return;
    }
    setAttachments((current) => current.some((item) => item.id === file.id) ? current : [...current, file]);
    setMessage("");
    markPreviewStale();
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((item) => item.id !== id));
    markPreviewStale();
  }

  function selectFieldFile(key: string, file: AttachmentFile, maxFiles = 1) {
    setFieldFiles((current) => {
      const list = current[key] ?? [];
      if (list.some((item) => item.id === file.id) || list.length >= maxFiles) return current;
      return { ...current, [key]: [...list, file] };
    });
    setMessage("");
    markPreviewStale();
  }

  function removeFieldFile(key: string, fileId?: string) {
    setFieldFiles((current) => {
      const next = { ...current };
      if (fileId) {
        const list = (next[key] ?? []).filter((file) => file.id !== fileId);
        if (list.length) next[key] = list;
        else delete next[key];
      } else delete next[key];
      return next;
    });
    markPreviewStale();
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
    markPreviewStale();
  }

  function buildGenerationPayload() {
    if (!selectedTemplate || !selectedVersion) throw new Error("Selecciona una plantilla con version activa.");
    const missing = slots.filter((slot) => slot.required && !files[slot.key!]);
    if (missing.length > 0) throw new Error(`Carga: ${missing.map((slot) => slot.name).join(", ")}.`);
    const missingFiles = fileSlots.filter((slot) => slot.required && !(fieldFiles[slot.key!]?.length));
    if (missingFiles.length > 0) throw new Error(`Carga archivo: ${missingFiles.map((slot) => slot.name).join(", ")}.`);
    return {
      templateId: selectedTemplate.id,
      templateVersionId: selectedVersion.id,
      requestKey: requestKey.current,
      inputs: Object.fromEntries(Object.entries(files).map(([key, file]) => [key, { storedFileId: file.id }])),
      fileInputs: Object.fromEntries(Object.entries(fieldFiles).map(([key, files]) => [key, { storedFileIds: files.map((file) => file.id) }])),
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
    setPreviewStale(false);
  }

  function markPreviewStale() {
    if (previewUrl) setPreviewStale(true);
  }

  const generationSteps = [
    { label: "Plantilla", complete: Boolean(selectedTemplate && selectedVersion) },
    { label: "Datos", complete: variableKeys.every((key) => Boolean(variables[key]?.trim())) },
    { label: "Archivos", complete: slots.every((slot) => !slot.required || Boolean(files[slot.key!])) && fileSlots.every((slot) => !slot.required || Boolean(fieldFiles[slot.key!]?.length)) },
    { label: "Revisar", complete: Boolean(previewUrl && !previewStale) },
    { label: "Generar", complete: Boolean(result) },
  ];

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

      <ol className="generation-stepper" aria-label="Proceso de generacion">
        {generationSteps.map((step, index) => <li className={step.complete ? "is-complete" : ""} key={step.label}><span>{index + 1}</span>{step.label}</li>)}
      </ol>

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
                <select value={selectedVersion?.id ?? ""} onChange={(event) => { setVersionId(event.target.value); setFiles({}); setFieldFiles({}); setResult(null); closePreview(); }}>
                  {selectedTemplate.versions.map((version) => <option key={version.id} value={version.id}>Version {version.versionNumber}{version.isActive ? " , activa" : ""}</option>)}
                </select>
              </label>
            </div>
            <div className="generation-config-meta">
              <span><strong>Formato</strong>{selectedVersion?.paperSize ?? "Sin version"} {selectedVersion?.orientation === "LANDSCAPE" ? "horizontal" : "vertical"}</span>
              <span><strong>Campos de imagen</strong>{slots.length}</span>
              <span><strong>Campos de archivo</strong>{fileSlots.length}</span>
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
                <div><p className="eyebrow">Campos de archivo</p><h3>PDF, DOC o DOCX de plantilla</h3></div>
                <span className="section-count">{Object.keys(fieldFiles).length}/{fileSlots.length}</span>
              </div>
              {fileSlots.length ? (
                <div className="generation-slots">
                  {fileSlots.map((slot) => {
                    const selected = fieldFiles[slot.key!] ?? [];
                    const options = attachmentCandidates(libraryFiles.data?.items ?? []).filter((file) => fileMatchesSlot(file, slot.properties));
                    const maxFiles = fieldMaxFiles(slot);
                    return <div className={`generation-slot ${selected.length ? "is-filled" : ""}`} key={slot.id}>
                      <div className="slot-heading">
                        <span><Paperclip className="size-4" />{slot.name}{slot.required ? " *" : ""}</span>
                        <small>{selected.length}/{maxFiles}</small>
                      </div>
                      <p className="slot-empty">{slot.properties.fileRenderMode === "PLACE" ? `Se ubicara en plantilla: ${Math.round(slot.width)} x ${Math.round(slot.height)} pt.` : "Se anexara como paginas completas al final."}</p>
                      {selected.length ? <div className="attachment-list">{selected.map((file) => <div className="attachment-row" key={file.id}><span><Paperclip className="size-4" />{file.originalName}</span><Button variant="ghost" size="icon" title="Quitar" aria-label={`Quitar ${file.originalName}`} onClick={() => removeFieldFile(slot.key!, file.id)}><Trash2 className="size-4" /></Button></div>)}</div> : null}
                      <label className="field">
                        <span>{selected.length >= maxFiles ? "Limite alcanzado" : "Agregar archivo"}</span>
                        <select value="" disabled={selected.length >= maxFiles} onChange={(event) => { const file = options.find((item) => item.id === event.target.value); if (file) selectFieldFile(slot.key!, file, maxFiles); }}>
                          <option value="">Seleccionar archivo de biblioteca</option>
                          {options.map((file) => <option key={file.id} value={file.id}>{file.originalName}</option>)}
                        </select>
                      </label>
                      <label className={`slot-file-button ${selected.length >= maxFiles || fieldUploadMutation.isPending ? "is-disabled" : ""}`}>
                        <input type="file" accept={acceptForSlot(slot.properties)} disabled={selected.length >= maxFiles || fieldUploadMutation.isPending} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (selected.length >= maxFiles) { setMessage(`Puedes subir un maximo de ${maxFiles} archivo(s) para ${slot.name}.`); return; } fieldUploadMutation.mutate({ key: slot.key!, file, slot }); }} />
                        <Paperclip className="size-4" />
                        <span>{fieldUploadMutation.isPending ? "Subiendo archivo..." : "Subir desde mi carpeta"}</span>
                      </label>
                    </div>;
                  })}
                </div>
              ) : <p className="panel-hint">Esta version no solicita archivos PDF/DOC/DOCX dentro de la plantilla.</p>}
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
                      <input value={variables[key] ?? ""} maxLength={500} placeholder={`Valor para ${key}`} onChange={(event) => { markPreviewStale(); setVariables((current) => ({ ...current, [key]: event.target.value })); }} />
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
              {previewUrl && previewStale ? "Actualizar previsualizacion" : previewMutation.isPending ? "Generando preview..." : "Previsualizar PDF"}
            </Button>
            <Button onClick={() => { setMessage(""); generateMutation.mutate(); }} disabled={generateMutation.isPending || previewMutation.isPending || uploadMutation.isPending || !selectedVersion}>
              <LoaderCircle className={`mr-2 size-4 ${generateMutation.isPending ? "animate-spin" : "hidden"}`} />
              Generar documento
            </Button>
            <span className="generation-action-hint">El PDF se guarda en archivos privados y recibe un correlativo unico.</span>
          </div>

          {previewUrl && <section className={`generation-preview ${previewStale ? "is-stale" : ""}`}><div className="section-heading"><div><p className="eyebrow">Preview real</p><h3>Previsualizacion del PDF</h3>{previewStale && <p className="panel-hint">La previsualizacion esta desactualizada. Actualizala antes de generar desde esta vista.</p>}</div><div className="preview-actions"><Button type="button" variant="ghost" onClick={closePreview}>Volver a editar</Button><Button type="button" variant="ghost" onClick={() => { setMessage(""); previewMutation.mutate(); }} disabled={previewMutation.isPending}>{previewMutation.isPending ? "Actualizando..." : "Actualizar preview"}</Button><Button type="button" onClick={() => { setMessage(""); generateMutation.mutate(); }} disabled={previewStale || generateMutation.isPending || previewMutation.isPending}>Generar PDF</Button></div></div><PdfViewer url={previewUrl} title={selectedTemplate.name} fileName="preview.pdf" sections={previewSections(selectedVersion, attachments, fieldFiles)} onDownload={() => downloadObjectUrl(previewUrl, "preview.pdf")} /></section>}
          {result && <section className="generation-result" role="status"><div><p className="eyebrow">Documento listo</p><h3>{result.number}</h3><p>La generacion se completo con la version {selectedVersion?.versionNumber} de {selectedTemplate.name}.</p></div><Button onClick={() => void downloadGeneration(result.id, `${result.number}.pdf`)}><Download className="mr-2 size-4" />Descargar PDF</Button></section>}
          {cropTarget && <ImageCropEditor file={cropTarget.file} contextName={slots.find((slot) => slot.key === cropTarget.key)?.name ?? cropTarget.file.name} onCancel={() => setCropTarget(null)} onApply={(file) => { const key = cropTarget.key; const slot = slots.find((entry) => entry.key === key); setCropTarget(null); markPreviewStale(); uploadMutation.mutate({ key, file, fileFieldId: slot?.fileFieldId }); }} />}
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
  return files.filter((file) => file.type === "PDF" || file.type === "DOCUMENT").map(toAttachmentFile);
}

function toAttachmentFile(file: StoredFile): AttachmentFile {
  return { id: file.id, originalName: file.originalName, type: file.type, mimeType: file.mimeType, sizeBytes: file.sizeBytes };
}

function fileMatchesSlot(file: AttachmentFile, properties: { acceptedMimeTypes?: string[]; maxSizeBytes?: number }) {
  if (properties.acceptedMimeTypes?.length && !properties.acceptedMimeTypes.includes(file.mimeType)) return false;
  if (properties.maxSizeBytes && Number(file.sizeBytes) > properties.maxSizeBytes) return false;
  return true;
}

function fieldMaxFiles(slot: { properties: { fileRenderMode?: string; maxFiles?: number } }) {
  if (slot.properties.fileRenderMode === "PLACE") return 1;
  return Math.max(1, Math.min(20, Math.round(slot.properties.maxFiles ?? 1)));
}

function validateFieldUpload(file: File, properties: { acceptedMimeTypes?: string[]; maxSizeBytes?: number }) {
  if (properties.acceptedMimeTypes?.length && !properties.acceptedMimeTypes.includes(file.type)) throw new Error(`Este campo acepta unicamente: ${properties.acceptedMimeTypes.join(", ")}.`);
  if (properties.maxSizeBytes && file.size > properties.maxSizeBytes) throw new Error(`El archivo supera el limite de ${Math.round(properties.maxSizeBytes / 1024 / 1024)} MB.`);
}

function acceptForSlot(properties: { acceptedMimeTypes?: string[] }) {
  return properties.acceptedMimeTypes?.length ? properties.acceptedMimeTypes.join(",") : ".pdf,.doc,.docx";
}

function previewSections(version: TemplatePage["items"][number]["versions"][number] | undefined, attachments: AttachmentFile[], fieldFiles: Record<string, AttachmentFile[]>) {
  const fieldFileCount = Object.values(fieldFiles).reduce((total, files) => total + files.length, 0);
  return [
    { label: "Documento principal", detail: `${version?.pageCount ?? 1} pagina(s)` },
    { label: "Campos de archivo", detail: `${fieldFileCount} archivo(s)` },
    { label: "Anexos", detail: `${attachments.length} archivo(s)` },
  ];
}

function downloadObjectUrl(url: string, name: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
}
