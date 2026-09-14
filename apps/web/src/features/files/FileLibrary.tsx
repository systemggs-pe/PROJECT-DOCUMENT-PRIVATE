import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileImage, ImagePlus, LoaderCircle, Search, Trash2, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch, apiJson, downloadFile } from "@/lib/api";
import { formatBytes, validateFile, type FilePage, type StoredFile } from "./file-model";

export default function FileLibrary() {
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"" | "IMAGE" | "PDF">("");
  const files = useQuery({
    queryKey: ["files", page, search, type],
    queryFn: () => apiJson<FilePage>(`/files?page=${page}&pageSize=12&search=${encodeURIComponent(search)}${type ? `&type=${type}` : ""}`),
    staleTime: 0,
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const error = validateFile(file);
      if (error) throw new Error(error);
      const form = new FormData();
      form.append("file", file);
      const response = await apiFetch("/files", { method: "POST", body: form });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: { message?: string }; message?: string };
        throw new Error(data.error?.message ?? data.message ?? "No se pudo subir el archivo.");
      }
      return response.json() as Promise<StoredFile>;
    },
    onSuccess: () => {
      setPage(1);
      void cache.invalidateQueries({ queryKey: ["files"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiJson<{ deleted: boolean }>(`/files/${id}`, { method: "DELETE" }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["files"] }),
  });

  return <div className="studio-page">
    <div className="page-heading">
      <div><p className="eyebrow">Archivo privado</p><h2>Archivos</h2><p className="page-subtitle">Sube imagenes reales para usarlas despues en los campos de tus documentos.</p></div>
    </div>
    <FileUploader busy={upload.isPending} error={upload.error?.message ?? ""} onUpload={(file) => upload.mutate(file)} />
    <div className="template-filters">
      <label className="field"><span>Buscar</span><span className="input-with-icon"><Search className="size-4" /><input value={search} placeholder="Nombre de archivo" onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></span></label>
      <label className="field"><span>Tipo</span><select value={type} onChange={(event) => { setType(event.target.value as typeof type); setPage(1); }}><option value="">Todos</option><option value="IMAGE">Imagenes</option><option value="PDF">PDF</option></select></label>
    </div>
    {remove.error && <p className="studio-error" role="alert">{remove.error.message}</p>}
    {files.isPending ? <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando archivos...</div> : files.isError ? <section className="empty-state" role="alert"><h2>No se pudieron cargar los archivos</h2><p>{files.error.message}</p><Button onClick={() => void files.refetch()}>Reintentar</Button></section> : !files.data.items.length ? <section className="empty-state"><FileImage className="size-7" /><h3>No tienes archivos todavia</h3><p>Sube una imagen para utilizarla en tus documentos.</p></section> : <div className="file-grid">{files.data.items.map((file) => <FileCard key={file.id} file={file} deleting={remove.isPending} onDelete={() => { if (window.confirm("Eliminar este archivo?")) remove.mutate(file.id); }} />)}</div>}
    {files.data && files.data.totalPages > 1 && <nav className="pagination" aria-label="Paginacion de archivos"><Button variant="ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button><span>Pagina {files.data.page} de {files.data.totalPages}</span><Button variant="ghost" disabled={page >= files.data.totalPages} onClick={() => setPage((value) => value + 1)}>Siguiente</Button></nav>}
  </div>;
}

function FileUploader({ busy, error, onUpload }: { busy: boolean; error: string; onUpload: (file: File) => void }) {
  const [selection, setSelection] = useState<{ file: File; preview: string } | null>(null);
  const selected = selection?.file ?? null;
  const preview = selection?.preview ?? "";
  const validation = useMemo(() => selected ? validateFile(selected) : "", [selected]);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
  function choose(file: File | undefined) {
    if (preview) URL.revokeObjectURL(preview);
    setSelection(file ? { file, preview: URL.createObjectURL(file) } : null);
  }
  return <section className="file-uploader" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files[0]); }}>
    <label className="upload-dropzone">
      <UploadCloud className="size-6" />
      <span>{selected ? selected.name : "Arrastra una imagen o selecciona un archivo"}</span>
      <small>JPG, PNG o WebP, maximo 10 MB. SVG y ejecutables no estan permitidos.</small>
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => choose(event.target.files?.[0])} />
    </label>
    {preview && !validation && <img className="upload-preview" src={preview} alt={`Preview de ${selected?.name ?? "archivo"}`} />}
    {(validation || error) && <p className="studio-error" role="alert">{validation || error}</p>}
    {selected && <Button disabled={busy || Boolean(validation)} onClick={() => onUpload(selected)}><LoaderCircle className={`mr-2 size-4 ${busy ? "animate-spin" : "hidden"}`} /><ImagePlus className={`mr-2 size-4 ${busy ? "hidden" : ""}`} />{busy ? "Subiendo..." : "Subir imagen"}</Button>}
  </section>;
}

function FileCard({ file, deleting, onDelete }: { file: StoredFile; deleting: boolean; onDelete: () => void }) {
  const signed = useQuery({
    queryKey: ["files", file.id, "signed-url"],
    queryFn: () => apiJson<{ url: string; expiresIn: number }>(`/files/${file.id}/signed-url`),
    enabled: file.type === "IMAGE",
    staleTime: 240_000,
  });
  return <article className="file-card">
    <div className="file-preview">{file.type === "IMAGE" && signed.data?.url ? <img src={signed.data.url} alt={file.originalName} loading="lazy" /> : <FileImage className="size-8" />}</div>
    <div className="file-card-body">
      <strong title={file.originalName}>{file.originalName}</strong>
      <span>{file.type === "IMAGE" ? "Imagen" : "PDF"} - {formatBytes(Number(file.sizeBytes))}</span>
      <span>{file.width && file.height ? `${file.width} x ${file.height}px` : file.mimeType}</span>
      <time dateTime={file.createdAt}>{new Date(file.createdAt).toLocaleString("es-PE")}</time>
    </div>
    <div className="file-actions">
      <Button variant="ghost" size="icon" title="Descargar" aria-label={`Descargar ${file.originalName}`} onClick={() => void downloadFile(file.id, file.originalName)}><Download className="size-4" /></Button>
      {file.type === "IMAGE" && <Button variant="ghost" size="icon" title="Eliminar" aria-label={`Eliminar ${file.originalName}`} disabled={deleting} onClick={onDelete}><Trash2 className="size-4" /></Button>}
    </div>
  </article>;
}
