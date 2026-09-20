import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

import { Button } from "@/components/ui/button";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

interface PdfViewerProps {
  url: string;
  title: string;
  fileName?: string;
  sections?: Array<{ label: string; detail: string }>;
  onDownload?: () => void;
}

export function PdfViewer({ url, title, fileName, sections = [], onDownload }: PdfViewerProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const thumbRefs = useRef(new Map<number, HTMLCanvasElement>());
  const [document, setDocument] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pageNumbers = useMemo(() => Array.from({ length: document?.numPages ?? 0 }, (_, index) => index + 1), [document?.numPages]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError("");
      setDocument(null);
      setPageNumber(1);
    });
    const task = pdfjsLib.getDocument({ url });
    void task.promise.then((loaded) => {
      if (cancelled) {
        return;
      }
      setDocument(loaded);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setError("No se pudo cargar la vista previa del PDF.");
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (!document || !canvasRef.current) return;
    let cancelled = false;
    void renderPage(document, pageNumber, canvasRef.current, zoom).catch(() => {
      if (!cancelled) setError("No se pudo mostrar esta página.");
    });
    return () => {
      cancelled = true;
    };
  }, [document, pageNumber, zoom]);

  useEffect(() => {
    if (!document) return;
    let cancelled = false;
    void Promise.all(pageNumbers.map(async (page) => {
      const canvas = thumbRefs.current.get(page);
      if (canvas && !cancelled) await renderPage(document, page, canvas, 0.18);
    })).catch(() => {
      if (!cancelled) setError("No se pudieron cargar las miniaturas.");
    });
    return () => {
      cancelled = true;
    };
  }, [document, pageNumbers]);

  function goTo(delta: number) {
    setPageNumber((current) => Math.min(Math.max(current + delta, 1), document?.numPages ?? 1));
  }

  function changeZoom(delta: number) {
    setZoom((current) => Math.min(Math.max(Number((current + delta).toFixed(2)), 0.5), 2.5));
  }

  async function fitWidth() {
    if (!document || !rootRef.current) return;
    const stage = rootRef.current.querySelector(".pdf-page-stage");
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(240, (stage?.clientWidth ?? rootRef.current.clientWidth) - 48);
    setZoom(Math.min(Math.max(Number((availableWidth / viewport.width).toFixed(2)), 0.5), 2.5));
  }

  return (
    <section className="pdf-viewer" ref={rootRef} aria-label={title}>
      <div className="pdf-viewer-toolbar">
        <div>
          <p className="eyebrow">Documento final</p>
          <h3>{title}</h3>
          {fileName && <span>{fileName}</span>}
        </div>
        <div className="pdf-viewer-actions">
          <Button variant="ghost" size="icon" aria-label="Pagina anterior" disabled={pageNumber <= 1 || loading} onClick={() => goTo(-1)}><ChevronLeft className="size-4" /></Button>
          <span>{loading ? "Cargando..." : `Pagina ${pageNumber} / ${document?.numPages ?? 0}`}</span>
          <Button variant="ghost" size="icon" aria-label="Pagina siguiente" disabled={!document || pageNumber >= document.numPages} onClick={() => goTo(1)}><ChevronRight className="size-4" /></Button>
          <Button variant="ghost" size="icon" aria-label="Reducir zoom" disabled={zoom <= 0.5} onClick={() => changeZoom(-0.1)}><ZoomOut className="size-4" /></Button>
          <span>{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" aria-label="Aumentar zoom" disabled={zoom >= 2.5} onClick={() => changeZoom(0.1)}><ZoomIn className="size-4" /></Button>
          <Button variant="ghost" size="icon" aria-label="Ajustar ancho" onClick={() => void fitWidth()}><Maximize2 className="size-4" /></Button>
          {onDownload && <Button variant="ghost" size="icon" aria-label="Descargar PDF" onClick={onDownload}><Download className="size-4" /></Button>}
        </div>
      </div>
      {sections.length > 0 && <div className="pdf-viewer-sections">{sections.map((section) => <span key={`${section.label}-${section.detail}`}><strong>{section.label}</strong>{section.detail}</span>)}</div>}
      {error && <p className="studio-error" role="alert">{error}</p>}
      <div className="pdf-viewer-body">
        <aside className="pdf-thumbnails" aria-label="Miniaturas">
          {pageNumbers.map((page) => <button className={page === pageNumber ? "is-active" : ""} key={page} type="button" onClick={() => setPageNumber(page)}><canvas ref={(canvas) => { if (canvas) thumbRefs.current.set(page, canvas); else thumbRefs.current.delete(page); }} /><span>{page}</span></button>)}
        </aside>
        <div className="pdf-page-stage">
          {loading ? <div className="loading-row" role="status">Cargando PDF...</div> : <canvas ref={canvasRef} />}
        </div>
      </div>
    </section>
  );
}

async function renderPage(document: pdfjsLib.PDFDocumentProxy, pageNumber: number, canvas: HTMLCanvasElement, scale: number) {
  const page = await document.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const context = canvas.getContext("2d");
  if (!context) return;
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, canvasContext: context, viewport }).promise;
}
