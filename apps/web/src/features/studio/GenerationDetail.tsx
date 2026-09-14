import { useState } from "react";
import { ArrowLeft, Download, FileText, LoaderCircle, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { apiJson, downloadGeneration } from "@/lib/api";
import type { Generation } from "./model";

export default function GenerationDetail() {
  const id = window.location.pathname.split("/").pop() ?? "";
  const cache = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [downloading, setDownloading] = useState(false);
  const detail = useQuery({ queryKey: ["generation", id], queryFn: () => apiJson<Generation>(`/generations/${id}`), staleTime: 30_000, enabled: Boolean(id) });
  const remove = useMutation({ mutationFn: () => apiJson<{ deleted: boolean }>(`/generations/${id}`, { method: "DELETE" }), onSuccess: () => { void cache.invalidateQueries({ queryKey: ["generations"] }); goBack(); }, onError: (error) => { setMessage(error instanceof Error ? error.message : "No se pudo eliminar el documento."); setConfirming(false); } });
  if (detail.isPending) return <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando detalle...</div>;
  if (detail.isError) return <section className="empty-state" role="alert"><h2>No pudimos cargar este documento</h2><p>El documento no existe o no está disponible.</p><Button onClick={goBack}><ArrowLeft className="mr-2 size-4" />Volver al historial</Button></section>;
  const item = detail.data;
  async function download() { setMessage(""); setDownloading(true); try { await downloadGeneration(item.id, `${item.number}.pdf`); } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo descargar el PDF."); } finally { setDownloading(false); } }
  return <div className="studio-page"><div className="page-heading"><div><button type="button" className="detail-back" onClick={goBack}><ArrowLeft className="size-4" />Volver al historial</button><p className="eyebrow">Detalle de generación</p><h2>{item.number}</h2><p className="page-subtitle">Documento generado con la versión exacta utilizada en ese momento.</p></div><StatusBadge status={item.status} /></div>
    {message && <p className="studio-error" role="alert">{message}</p>}
    <div className="generation-detail-grid"><section className="detail-section"><div className="section-heading"><div><p className="eyebrow">Documento</p><h3>Archivo generado</h3></div><FileText className="size-5" /></div><dl className="detail-list"><div><dt>Nombre</dt><dd>{item.outputFile?.originalName ?? "Sin archivo"}</dd></div><div><dt>Tamaño</dt><dd>{item.outputFile ? formatBytes(item.outputFile.sizeBytes) : "No disponible"}</dd></div><div><dt>Creado</dt><dd>{new Date(item.createdAt).toLocaleString("es-PE")}</dd></div><div><dt>Estado</dt><dd>{statusLabel(item.status)}</dd></div></dl>{item.status === "COMPLETED" && <Button onClick={() => void download()} disabled={downloading}><LoaderCircle className={`mr-2 size-4 ${downloading ? "animate-spin" : "hidden"}`} /><Download className="mr-2 size-4" />Descargar PDF</Button>}</section>
      <section className="detail-section"><div className="section-heading"><div><p className="eyebrow">Origen</p><h3>Plantilla utilizada</h3></div></div><dl className="detail-list"><div><dt>Plantilla</dt><dd>{item.template?.name ?? "No disponible"}</dd></div><div><dt>Versión</dt><dd>v{item.templateVersion?.versionNumber ?? "-"}</dd></div><div><dt>Formato</dt><dd>{item.templateVersion?.paperSize ?? "-"} {item.templateVersion?.orientation === "LANDSCAPE" ? "horizontal" : "vertical"}</dd></div><div><dt>Páginas</dt><dd>{item.templateVersion?.pageCount ?? "-"}</dd></div></dl></section></div>
    <section className="detail-section"><div className="section-heading"><div><p className="eyebrow">Entradas</p><h3>Archivos y valores utilizados</h3></div><span className="section-count">{item.inputs?.length ?? 0}</span></div>{item.inputs?.length ? <div className="detail-input-list">{item.inputs.map((input) => <div className="detail-input-row" key={input.id}><span><strong>{input.templateElement.name}</strong><small>{input.key}</small></span><span>{input.file ? <><FileText className="size-4" />{input.file.originalName}</> : formatValue(input.value)}</span></div>)}</div> : <p className="panel-hint">Esta generación no registró entradas adicionales.</p>}</section>
    {item.status === "FAILED" && item.errorMessage && <p className="studio-error" role="status">{item.errorMessage}</p>}
    {(item.status === "COMPLETED" || item.status === "FAILED") && <Button variant="ghost" onClick={() => setConfirming(true)}><Trash2 className="mr-2 size-4" />Eliminar documento</Button>}
    {confirming && <div className="inline-dialog-backdrop"><section className="inline-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-generation-title"><h3 id="delete-generation-title">¿Eliminar este documento?</h3><p>Esta acción no se puede deshacer. Se conservará el registro de auditoría.</p><div className="inline-dialog-actions"><Button variant="ghost" onClick={() => setConfirming(false)}>Cancelar</Button><Button onClick={() => remove.mutate()} disabled={remove.isPending}><LoaderCircle className={`mr-2 size-4 ${remove.isPending ? "animate-spin" : "hidden"}`} />Eliminar</Button></div></section></div>}
  </div>;
}

function StatusBadge({ status }: { status: string }) { return <span className={`status-badge status-${status.toLowerCase()}`}><span aria-hidden={true} />{statusLabel(status)}</span>; }
function statusLabel(status: string) { return status === "COMPLETED" ? "Completado" : status === "PROCESSING" ? "Procesando" : status === "PENDING" ? "Pendiente" : "Fallido"; }
function formatBytes(value: string) { const bytes = Number(value); if (!Number.isFinite(bytes)) return "No disponible"; if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function formatValue(value: unknown) { return typeof value === "string" && value ? value : "Sin valor"; }
function goBack() { window.history.pushState(null, "", "/generations"); window.dispatchEvent(new PopStateEvent("popstate")); }
