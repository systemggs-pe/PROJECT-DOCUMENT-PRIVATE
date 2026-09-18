import { useEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import { AlignCenterHorizontal, ArrowDown, ArrowLeft, ArrowUp, Copy, Eye, Grid3X3, ImagePlus, Maximize2, Minus, Paperclip, Plus, Redo2, Save, Square, Trash2, Type, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { describeMimeTypes, type FileField } from "@/features/file-fields/file-field-model";
import { useFileFields } from "@/features/file-fields/useFileFields";
import { documentToEditor, newElement, normalizeDraft, normalizeElement, paperSizes, snapElement, validateDraftForSave } from "./model";
import type { Draft, StudioElement } from "./model";

interface EditorContext {
  versionNumber?: number;
  isActive?: boolean;
}

interface EditorProps {
  initial: Draft;
  saving: boolean;
  error: string;
  context?: EditorContext | undefined;
  onSave: (draft: Draft) => void;
  onBack: () => void;
  onDuplicate?: (() => void) | undefined;
}

export function Tool({ icon: Icon, label, onClick, disabled = false }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean }) {
  return <Button type="button" variant="ghost" size="icon" title={label} aria-label={label} disabled={disabled} onClick={onClick}><Icon className="size-4" /></Button>;
}

export function NumberField({ label, value, onChange, min = 0, max = 2000 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return <label className="field"><span>{label}</span><input type="number" step="0.1" min={min} max={max} value={Number.isFinite(value) ? Number(value.toFixed(3)) : ""} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next))); }} /></label>;
}

export default function Editor({ initial, saving, error, context, onSave, onBack, onDuplicate }: EditorProps) {
  const [timeline, setTimeline] = useState({ states: [normalizeDraft(initial)], index: 0 });
  const draft = timeline.states[timeline.index]!;
  const [selected, select] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(0.7);
  const [grid, setGrid] = useState(true);
  const [preview, setPreview] = useState(false);
  const [localError, setLocalError] = useState("");
  const fileFields = useFileFields("?status=ACTIVE");
  const fileFieldOptions = fileFields.data?.items ?? [];
  const dirty = timeline.index !== 0;
  const desk = useRef<HTMLDivElement>(null);
  const item = draft.elements.find((element) => element.id === selected);

  useEffect(() => {
    const element = desk.current;
    if (!element) return;
    setZoom(Math.min(1, Math.max(0.25, (element.clientWidth - 48) / draft.width)));
  }, [draft.width]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) return;
      if (!selected) return;
      const element = draft.elements.find((entry) => entry.id === selected);
      if (!element) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        change({ ...draft, elements: draft.elements.filter((entry) => entry.id !== selected) });
        select(null);
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const moved = normalizeElement({
          ...element,
          x: element.x + (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
          y: element.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
        }, draft);
        change({ ...draft, elements: draft.elements.map((entry) => entry.id === selected ? moved : entry) });
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [draft, selected]);

  function change(next: Draft) {
    setLocalError("");
    setTimeline((state) => {
      const states = [...state.states.slice(0, state.index + 1), normalizeDraft(next)].slice(-80);
      return { states, index: states.length - 1 };
    });
  }
  function patch(patchValue: Partial<StudioElement>) {
    if (!item) return;
    const next = normalizeElement({ ...item, ...patchValue }, draft);
    change({ ...draft, elements: draft.elements.map((element) => element.id === selected ? next : element) });
  }
  function property(patchValue: Partial<StudioElement["properties"]>) { if (item) patch({ properties: { ...item.properties, ...patchValue } }); }
  function add(type: StudioElement["type"]) {
    const element = newElement(type, draft.elements.length + 1, page);
    change({ ...draft, elements: [...draft.elements, element] });
    select(element.id);
  }
  function paper(size: Draft["paperSize"], orientation = draft.orientation) {
    const dimensions = size === "CUSTOM" ? [draft.width, draft.height] : [...paperSizes[size]];
    if (orientation === "LANDSCAPE" && size !== "CUSTOM") dimensions.reverse();
    change({ ...draft, paperSize: size, orientation, width: dimensions[0]!, height: dimensions[1]! });
  }
  function fitZoom() {
    const element = desk.current;
    if (!element) return;
    setZoom(Math.min(1, Math.max(0.25, (element.clientWidth - 48) / draft.width)));
  }
  function save() {
    const normalized = normalizeDraft(draft);
    const validation = validateDraftForSave(normalized);
    if (validation) {
      setLocalError(validation);
      return;
    }
    onSave(normalized);
  }

  return <section className="studio-editor">
    <div className="studio-heading">
      <div className="editor-title">
        <div className="flex min-w-0 items-center gap-2">
          <Tool icon={ArrowLeft} label="Volver a plantillas" onClick={() => { if (!dirty || window.confirm("Hay cambios sin guardar. Descartarlos?")) onBack(); }} />
          <div className="min-w-0">
            <p className="breadcrumbs">Plantillas / {draft.name || "Nueva plantilla"}{context?.versionNumber ? ` / Version ${context.versionNumber}` : ""}</p>
            <h2 className="truncate text-lg font-semibold">{draft.name}</h2>
          </div>
        </div>
        {context?.isActive !== undefined && <span className={context.isActive ? "status-pill is-active" : "status-pill"}>{context.isActive ? "Version activa" : "Borrador"}</span>}
      </div>
      <div className="editor-heading-actions">
        {onDuplicate && <Button type="button" variant="ghost" onClick={onDuplicate}><Copy className="mr-2 size-4" />Duplicar version</Button>}
        <Button disabled={saving} onClick={save}><Save className="mr-2 size-4" />{saving ? "Guardando..." : "Guardar"}</Button>
      </div>
    </div>
    {(error || localError) && <p className="studio-error" role="alert">{localError || error}</p>}
    <div className="studio-toolbar" role="toolbar" aria-label="Herramientas del documento">
      <Tool icon={Undo2} label="Deshacer" disabled={timeline.index === 0} onClick={() => setTimeline({ ...timeline, index: timeline.index - 1 })} />
      <Tool icon={Redo2} label="Rehacer" disabled={timeline.index === timeline.states.length - 1} onClick={() => setTimeline({ ...timeline, index: timeline.index + 1 })} />
      <span className="toolbar-separator" />
      <Tool icon={ImagePlus} label="Agregar imagen" onClick={() => add("IMAGE")} disabled={draft.elements.length >= 100} />
      <Tool icon={Paperclip} label="Agregar archivo" onClick={() => add("FILE")} disabled={draft.elements.length >= 100} />
      <Tool icon={Type} label="Agregar texto" onClick={() => add("TEXT")} disabled={draft.elements.length >= 100} />
      <Tool icon={Square} label="Agregar rectangulo" onClick={() => add("RECTANGLE")} disabled={draft.elements.length >= 100} />
      <Tool icon={Minus} label="Agregar linea" onClick={() => add("LINE")} disabled={draft.elements.length >= 100} />
      <span className="toolbar-separator" />
      <Tool icon={Eye} label={preview ? "Volver a editar" : "Vista previa"} onClick={() => setPreview(!preview)} />
      <Tool icon={Grid3X3} label={grid ? "Ocultar cuadricula" : "Mostrar cuadricula"} onClick={() => setGrid(!grid)} />
      <span className="toolbar-separator" />
      <Tool icon={ZoomOut} label="Alejar" disabled={zoom <= 0.25} onClick={() => setZoom((value) => Math.max(0.25, value - 0.1))} />
      <Tool icon={Maximize2} label="Ajustar a pantalla" onClick={fitZoom} />
      <Tool icon={ZoomIn} label="Acercar" disabled={zoom >= 1.5} onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))} />
      <label className="ml-auto flex items-center gap-2 text-sm">Zoom <input aria-label="Zoom" type="range" min="0.25" max="1.5" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="w-24" /><output className="w-12">{Math.round(zoom * 100)}%</output></label>
    </div>
    <div className="editor-layout">
      <div className="min-w-0">
        <div className="canvas-strip">
          <label>Pagina <select aria-label="Pagina" value={Math.min(page, draft.pageCount)} onChange={(event) => setPage(Number(event.target.value))}>{Array.from({ length: draft.pageCount }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
          <Tool icon={Plus} label="Agregar pagina" disabled={draft.pageCount >= 20} onClick={() => { change({ ...draft, pageCount: draft.pageCount + 1 }); setPage(draft.pageCount + 1); }} />
          <span>{draft.paperSize} - {draft.orientation === "PORTRAIT" ? "Vertical" : "Horizontal"} - {draft.width} x {draft.height} pt</span>
        </div>
        <div className="document-desk" ref={desk}>
          <div className={`document-sheet ${grid && !preview ? "has-grid" : ""}`} data-testid="document-sheet" onMouseDown={(event) => { if (event.target === event.currentTarget) select(null); }} style={{ width: documentToEditor(draft.width, zoom), height: documentToEditor(draft.height, zoom) }}>
            {!preview && <div className="page-margins" style={{ top: draft.marginTop * zoom, right: draft.marginRight * zoom, bottom: draft.marginBottom * zoom, left: draft.marginLeft * zoom }} />}
            {draft.elements.filter((element) => element.page === Math.min(page, draft.pageCount)).sort((a, b) => a.zIndex - b.zIndex).map((element) => <Rnd key={element.id} bounds="parent" size={{ width: element.width * zoom, height: element.height * zoom }} position={{ x: element.x * zoom, y: element.y * zoom }} minWidth={5 * zoom} minHeight={2 * zoom} dragGrid={grid ? [5 * zoom, 5 * zoom] : [1, 1]} resizeGrid={grid ? [5 * zoom, 5 * zoom] : [1, 1]} disableDragging={preview} enableResizing={!preview && selected === element.id} onMouseDown={() => select(element.id)} onDragStop={(_event, data) => { const moved = snapElement({ ...element, x: data.x / zoom, y: data.y / zoom }, draft); change({ ...draft, elements: draft.elements.map((other) => other.id === element.id ? moved : other) }); }} onResizeStop={(_event, _direction, ref, _delta, position) => { const resized = snapElement({ ...element, width: ref.offsetWidth / zoom, height: ref.offsetHeight / zoom, x: position.x / zoom, y: position.y / zoom }, draft); change({ ...draft, elements: draft.elements.map((other) => other.id === element.id ? resized : other) }); }} style={{ zIndex: element.zIndex }}>
              <button type="button" aria-label={`Seleccionar ${element.name}`} className={`document-element ${selected === element.id && !preview ? "is-selected" : ""} element-${element.type.toLowerCase()}`} onClick={() => select(element.id)} style={{ transform: `rotate(${element.rotation}deg)`, fontSize: element.properties.fontSize * zoom, fontFamily: element.properties.fontFamily, fontWeight: element.properties.fontWeight, color: element.properties.color, textAlign: element.properties.textAlign, background: element.type === "RECTANGLE" ? element.properties.fill : undefined, borderWidth: element.type === "IMAGE" ? (element.properties.border ? element.properties.borderWidth * zoom : 0) : element.type === "RECTANGLE" ? element.properties.strokeWidth * zoom : 0, borderColor: element.properties.stroke, borderRadius: element.properties.borderRadius * zoom }}>
                {element.type === "IMAGE" ? <span className="slot-label"><ImagePlus size={20 * zoom} />{element.name}{element.required ? " *" : ""}<small>{element.key}</small></span> : element.type === "FILE" ? <span className="slot-label"><Paperclip size={20 * zoom} />{element.name}{element.required ? " *" : ""}<small>{element.properties.fileRenderMode === "PLACE" ? `${Math.round(element.width)} x ${Math.round(element.height)} pt` : "Anexo completo"}</small></span> : element.type === "TEXT" ? element.properties.text : element.type === "LINE" ? <span className="document-line" style={{ background: element.properties.stroke, height: Math.max(1, element.properties.strokeWidth * zoom) }} /> : null}
              </button>
            </Rnd>)}
          </div>
        </div>
      </div>
      <aside className="property-panel">
        <h3 className="font-semibold">Documento</h3>
        <label className="field"><span>Nombre</span><input maxLength={120} value={draft.name} onChange={(event) => change({ ...draft, name: event.target.value })} /></label>
        <label className="field"><span>Descripcion</span><textarea value={draft.description} maxLength={1000} onChange={(event) => change({ ...draft, description: event.target.value })} /></label>
        <div className="field-grid"><label className="field"><span>Papel</span><select value={draft.paperSize} onChange={(event) => paper(event.target.value as Draft["paperSize"])}>{["A4", "A5", "LETTER", "LEGAL", "CUSTOM"].map((size) => <option key={size}>{size}</option>)}</select></label><label className="field"><span>Orientacion</span><select value={draft.orientation} onChange={(event) => paper(draft.paperSize, event.target.value as Draft["orientation"])}><option value="PORTRAIT">Vertical</option><option value="LANDSCAPE">Horizontal</option></select></label></div>
        {draft.paperSize === "CUSTOM" && <div className="field-grid"><NumberField label="Ancho de pagina" value={draft.width} min={100} onChange={(width) => change({ ...draft, width })} /><NumberField label="Alto de pagina" value={draft.height} min={100} onChange={(height) => change({ ...draft, height })} /></div>}
        <details><summary>Margenes (pt)</summary><div className="field-grid">{(["marginTop", "marginRight", "marginBottom", "marginLeft"] as const).map((key, i) => <NumberField key={key} label={["Superior", "Derecho", "Inferior", "Izquierdo"][i]!} value={draft[key]} onChange={(value) => change({ ...draft, [key]: value })} />)}</div></details>
        <h3 className="border-t border-[var(--line)] pt-3 font-semibold">Capas ({draft.elements.length})</h3>
        <select aria-label="Elemento seleccionado" value={selected ?? ""} onChange={(event) => select(event.target.value || null)}><option value="">Seleccionar elemento</option>{[...draft.elements].sort((a, b) => b.zIndex - a.zIndex).map((element) => <option key={element.id} value={element.id}>{element.page}. {element.name}</option>)}</select>
        {item ? <ElementFields item={item} draft={draft} fileFields={fileFieldOptions} patch={patch} property={property} change={change} select={select} /> : <p className="panel-hint">Selecciona un elemento o crea uno desde la barra de herramientas.</p>}
      </aside>
    </div>
    <div className="editor-statusbar"><span>{dirty ? "Cambios sin guardar" : "Sin cambios pendientes"}</span><span>Origen arriba-izquierda, unidades en pt</span><span>{preview ? "Vista previa" : "Modo edicion"}</span></div>
  </section>;
}

function ElementFields({ item, draft, fileFields, patch, property, change, select }: { item: StudioElement; draft: Draft; fileFields: FileField[]; patch: (value: Partial<StudioElement>) => void; property: (value: Partial<StudioElement["properties"]>) => void; change: (draft: Draft) => void; select: (id: string | null) => void }) {
  const compatibleFields = fileFields.filter((field) => item.type === "IMAGE" ? field.acceptedMimeTypes.some((mime) => mime.startsWith("image/")) : item.type === "FILE" ? field.acceptedMimeTypes.some((mime) => !mime.startsWith("image/")) : false);
  function applyFileField(fieldId: string) {
    const field = compatibleFields.find((entry) => entry.id === fieldId);
    if (!field) {
      patch({ fileFieldId: null });
      return;
    }
    patch({
      fileFieldId: field.id,
      name: field.label,
      key: field.key,
      required: field.required,
      properties: {
        ...item.properties,
        acceptedMimeTypes: field.acceptedMimeTypes.filter((mime) => item.type === "IMAGE" ? mime.startsWith("image/") : !mime.startsWith("image/")),
        maxFiles: item.type === "FILE" ? field.maxFiles : 1,
        maxSizeBytes: field.maxFileSize,
      },
    });
  }
  return <>
    <div className="flex flex-wrap">
      <Tool icon={Copy} label="Duplicar elemento" disabled={draft.elements.length >= 100} onClick={() => { const copy = normalizeElement({ ...item, id: crypto.randomUUID(), key: item.key ? `${item.key}_copy`.slice(0, 60) : null, x: item.x + 10, y: item.y + 10, zIndex: Math.min(1000, Math.max(...draft.elements.map((element) => element.zIndex)) + 1) }, draft); change({ ...draft, elements: [...draft.elements, copy] }); select(copy.id); }} />
      <Tool icon={Trash2} label="Eliminar elemento" onClick={() => { change({ ...draft, elements: draft.elements.filter((element) => element.id !== item.id) }); select(null); }} />
      <Tool icon={AlignCenterHorizontal} label="Centrar horizontalmente" onClick={() => patch({ x: (draft.width - item.width) / 2 })} />
      <Tool icon={ArrowUp} label="Traer al frente" onClick={() => patch({ zIndex: Math.min(1000, Math.max(...draft.elements.map((element) => element.zIndex)) + 1) })} />
      <Tool icon={ArrowDown} label="Enviar al fondo" onClick={() => patch({ zIndex: 0 })} />
    </div>
    <label className="field"><span>Nombre del elemento</span><input value={item.name} onChange={(event) => patch({ name: event.target.value })} /></label>
    <div className="field-grid">{(["x", "y", "width", "height", "rotation"] as const).map((key) => <NumberField key={key} label={{ x: "X (pt)", y: "Y (pt)", width: "Ancho (pt)", height: "Alto (pt)", rotation: "Rotacion" }[key]} value={item[key]} min={key === "rotation" ? -180 : key === "width" || key === "height" ? 1 : 0} max={key === "rotation" ? 180 : 2000} onChange={(value) => patch({ [key]: value })} />)}</div>
    {item.type === "IMAGE" ? <><label className="field"><span>Campo de archivo</span><select value={item.fileFieldId ?? ""} onChange={(event) => applyFileField(event.target.value)}><option value="">Sin asociar</option>{compatibleFields.map((field) => <option key={field.id} value={field.id}>{field.label} · {describeMimeTypes(field.acceptedMimeTypes)}</option>)}</select></label><label className="field"><span>Clave</span><input value={item.key ?? ""} onChange={(event) => patch({ key: event.target.value })} /></label><label className="inline-check"><input type="checkbox" checked={item.required} onChange={(event) => patch({ required: event.target.checked })} />Obligatoria</label><label className="field"><span>Ajuste</span><select value={item.properties.fitMode} onChange={(event) => property({ fitMode: event.target.value as "contain" | "cover" | "stretch" })}><option value="contain">Contener</option><option value="cover">Cubrir</option><option value="stretch">Llenar</option></select></label><label className="inline-check"><input type="checkbox" checked={item.properties.border} onChange={(event) => property({ border: event.target.checked })} />Borde</label><NumberField label="Grosor borde" value={item.properties.borderWidth} max={10} onChange={(borderWidth) => property({ borderWidth })} /><NumberField label="Radio" value={item.properties.borderRadius} max={100} onChange={(borderRadius) => property({ borderRadius })} /></> : item.type === "FILE" ? <><label className="field"><span>Campo de archivo</span><select value={item.fileFieldId ?? ""} onChange={(event) => applyFileField(event.target.value)}><option value="">Sin asociar</option>{compatibleFields.map((field) => <option key={field.id} value={field.id}>{field.label} · {describeMimeTypes(field.acceptedMimeTypes)}</option>)}</select></label><label className="field"><span>Clave</span><input value={item.key ?? ""} onChange={(event) => patch({ key: event.target.value })} /></label><label className="inline-check"><input type="checkbox" checked={item.required} onChange={(event) => patch({ required: event.target.checked })} />Obligatorio</label><label className="field"><span>Uso del archivo</span><select value={item.properties.fileRenderMode} onChange={(event) => property({ fileRenderMode: event.target.value as "ATTACH" | "PLACE", maxFiles: event.target.value === "PLACE" ? 1 : item.properties.maxFiles })}><option value="ATTACH">Anexo de pagina completa</option><option value="PLACE">Ubicar dentro de esta hoja</option></select></label><p className="panel-hint">{item.properties.fileRenderMode === "PLACE" ? "El archivo usara el tamano y posicion del rectangulo seleccionado. Si el archivo tiene varias paginas se mostrara la primera aqui." : "El archivo completo se agregara despues del documento principal, ocupando sus propias paginas."}</p><Button type="button" variant="ghost" onClick={() => patch({ x: 0, y: 0, width: draft.width, height: draft.height })}><Maximize2 className="mr-2 size-4" />Ocupar hoja completa</Button><label className="field"><span>Formatos permitidos</span><select multiple value={item.properties.acceptedMimeTypes} onChange={(event) => property({ acceptedMimeTypes: Array.from(event.target.selectedOptions).map((option) => option.value) })}><option value="application/pdf">PDF</option><option value="application/msword">DOC</option><option value="application/vnd.openxmlformats-officedocument.wordprocessingml.document">DOCX</option></select></label><NumberField label="Maximo de archivos" value={item.properties.maxFiles} min={1} max={item.properties.fileRenderMode === "PLACE" ? 1 : 20} onChange={(maxFiles) => property({ maxFiles })} /><NumberField label="Tamano maximo bytes" value={item.properties.maxSizeBytes} min={1} max={30 * 1024 * 1024} onChange={(maxSizeBytes) => property({ maxSizeBytes })} /></> : item.type === "TEXT" ? <><label className="field"><span>Texto</span><textarea value={item.properties.text} onChange={(event) => property({ text: event.target.value })} /></label><div className="field-grid"><NumberField label="Tamano" value={item.properties.fontSize} min={6} max={100} onChange={(fontSize) => property({ fontSize })} /><label className="field"><span>Peso</span><select value={item.properties.fontWeight} onChange={(event) => property({ fontWeight: event.target.value as "400" | "500" | "600" | "700" })}><option value="400">Regular</option><option value="500">Medio</option><option value="600">Semibold</option><option value="700">Bold</option></select></label></div><label className="field"><span>Alineacion</span><select value={item.properties.textAlign} onChange={(event) => property({ textAlign: event.target.value as "left" | "center" | "right" })}><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></select></label><label className="field"><span>Color</span><input type="color" value={item.properties.color} onChange={(event) => property({ color: event.target.value })} /></label></> : item.type === "RECTANGLE" ? <><label className="field"><span>Fondo</span><input type="color" value={item.properties.fill} onChange={(event) => property({ fill: event.target.value })} /></label><label className="field"><span>Borde</span><input type="color" value={item.properties.stroke} onChange={(event) => property({ stroke: event.target.value })} /></label><NumberField label="Grosor" value={item.properties.strokeWidth} max={10} onChange={(strokeWidth) => property({ strokeWidth })} /><NumberField label="Radio" value={item.properties.borderRadius} max={100} onChange={(borderRadius) => property({ borderRadius })} /></> : <><label className="field"><span>Color</span><input type="color" value={item.properties.stroke} onChange={(event) => property({ stroke: event.target.value })} /></label><NumberField label="Grosor" value={item.properties.strokeWidth} max={10} onChange={(strokeWidth) => property({ strokeWidth })} /></>}
  </>;
}
