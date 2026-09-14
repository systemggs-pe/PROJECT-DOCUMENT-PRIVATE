import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, LoaderCircle, Plus, Power, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiJson } from "@/lib/api";
import { organizationStatusClass, organizationStatusLabel, type OrganizationItem, type OrganizationPageResponse } from "./organization-types";

export default function OrganizationsPage() {
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ name: "", slug: "", legalName: "", documentNumber: "", email: "", phone: "", address: "" });
  const query = useMemo(() => `/organizations?page=1&pageSize=50&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ""}`, [search, status]);
  const organizations = useQuery({ queryKey: ["admin", "organizations", query], queryFn: () => apiJson<OrganizationPageResponse>(query), staleTime: 10_000 });
  const create = useMutation({
    mutationFn: () => apiJson<OrganizationItem>("/organizations", { method: "POST", body: JSON.stringify(cleanDraft(draft)) }),
    onSuccess: () => {
      setDraft({ name: "", slug: "", legalName: "", documentNumber: "", email: "", phone: "", address: "" });
      setShowForm(false);
      void cache.invalidateQueries({ queryKey: ["admin", "organizations"] });
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "suspend" | "activate" }) => apiJson<OrganizationItem>(`/organizations/${id}/${action}`, { method: "POST" }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["admin", "organizations"] }),
  });

  return <div className="studio-page">
    <div className="page-heading"><div><p className="eyebrow">Multi-tenancy</p><h2>Organizaciones</h2><p className="page-subtitle">Controla tenants, estado operativo y volumen de usuarios, plantillas y documentos.</p></div><Button variant="ghost" onClick={() => setShowForm((value) => !value)}><Plus className="mr-2 size-4" />Nueva organización</Button></div>
    <section className="admin-controls"><label className="field"><span>Buscar</span><span className="input-with-icon"><Search className="size-4" /><input value={search} placeholder="Nombre, slug o razón social" onChange={(event) => setSearch(event.target.value)} /></span></label><label className="field"><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option><option value="ACTIVE">Activas</option><option value="SUSPENDED">Suspendidas</option><option value="ARCHIVED">Archivadas</option></select></label></section>
    {showForm && <section className="organization-form">
      <div className="section-heading"><div><p className="eyebrow">Alta</p><h3>Datos de organización</h3></div><Button onClick={() => void create.mutate()} disabled={create.isPending || draft.name.trim().length < 2}><LoaderCircle className={`mr-2 size-4 ${create.isPending ? "animate-spin" : "hidden"}`} />Crear</Button></div>
      <div className="organization-form-grid"><label className="field"><span>Nombre</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label className="field"><span>Slug</span><input value={draft.slug} placeholder="automatico si se deja vacio" onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))} /></label><label className="field"><span>Razón social</span><input value={draft.legalName} onChange={(event) => setDraft((current) => ({ ...current, legalName: event.target.value }))} /></label><label className="field"><span>Documento</span><input value={draft.documentNumber} onChange={(event) => setDraft((current) => ({ ...current, documentNumber: event.target.value }))} /></label><label className="field"><span>Email</span><input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></label><label className="field"><span>Teléfono</span><input value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} /></label><label className="field organization-form-wide"><span>Dirección</span><input value={draft.address} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} /></label></div>
      {create.error && <p className="studio-error" role="alert">{create.error.message}</p>}
    </section>}
    {organizations.isPending ? <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando organizaciones...</div> : organizations.isError ? <section className="empty-state" role="alert"><h2>No se pudieron cargar organizaciones</h2><p>{organizations.error.message}</p><Button onClick={() => void organizations.refetch()}>Reintentar</Button></section> : !organizations.data.items.length ? <section className="empty-state"><Building2 className="size-7" /><h3>No hay organizaciones con estos filtros</h3><p>Ajusta la búsqueda o crea una nueva organización.</p></section> : <div className="organization-table" role="table" aria-label="Organizaciones"><div className="organization-head" role="row"><span>Organización</span><span>Estado</span><span>Usuarios</span><span>Plantillas</span><span>Generaciones</span><span>Acciones</span></div>{organizations.data.items.map((item) => <div className="organization-row" role="row" key={item.id}><span><strong>{item.name}</strong><small>{item.slug}{item.legalName ? ` · ${item.legalName}` : ""}</small></span><span className={`status ${organizationStatusClass(item.status)}`}>{organizationStatusLabel(item.status)}</span><span>{item.userCount}</span><span>{item.templateCount}</span><span>{item.generationCount}</span><span className="admin-actions">{item.status === "ACTIVE" ? <Button variant="ghost" size="icon" title="Suspender" aria-label={`Suspender ${item.name}`} disabled={statusMutation.isPending} onClick={() => { if (window.confirm("Suspender esta organización bloqueará a sus usuarios. ¿Continuar?")) statusMutation.mutate({ id: item.id, action: "suspend" }); }}><Power className="size-4" /></Button> : <Button variant="ghost" size="icon" title="Activar" aria-label={`Activar ${item.name}`} disabled={statusMutation.isPending || item.status === "ARCHIVED"} onClick={() => statusMutation.mutate({ id: item.id, action: "activate" })}><RotateCcw className="size-4" /></Button>}</span></div>)}</div>}
  </div>;
}

function cleanDraft(draft: Record<string, string>) {
  return Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value));
}
