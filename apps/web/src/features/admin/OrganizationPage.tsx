import { useQuery } from "@tanstack/react-query";
import { Building2, FileClock, Layers3, LoaderCircle, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiJson } from "@/lib/api";
import { organizationStatusClass, organizationStatusLabel, type OrganizationItem } from "./organization-types";

export default function OrganizationPage() {
  const organization = useQuery({ queryKey: ["organization", "current"], queryFn: () => apiJson<OrganizationItem>("/organization"), staleTime: 30_000 });

  if (organization.isPending) return <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando organización...</div>;
  if (organization.isError) return <section className="empty-state" role="alert"><h2>No se pudo cargar tu organización</h2><p>{organization.error.message}</p><Button onClick={() => void organization.refetch()}>Reintentar</Button></section>;

  const item = organization.data;
  return <div className="studio-page">
    <div className="page-heading"><div><p className="eyebrow">Tenant actual</p><h2>{item.name}</h2><p className="page-subtitle">Tus plantillas, archivos, generaciones y auditoría se aíslan dentro de esta organización.</p></div><span className={`status-badge ${organizationStatusClass(item.status)}`}><span />{organizationStatusLabel(item.status)}</span></div>
    <section className="organization-summary"><article><UsersRound className="size-5" /><span>Usuarios</span><strong>{item.userCount}</strong></article><article><Layers3 className="size-5" /><span>Plantillas</span><strong>{item.templateCount}</strong></article><article><FileClock className="size-5" /><span>Generaciones</span><strong>{item.generationCount}</strong></article></section>
    <section className="detail-section">
      <div className="section-heading"><div><p className="eyebrow">Identidad</p><h3>Datos registrados</h3></div><Building2 className="size-5 text-[var(--accent)]" /></div>
      <dl className="detail-list"><div><dt>Slug</dt><dd>{item.slug}</dd></div><div><dt>Razón social</dt><dd>{item.legalName ?? "Sin registrar"}</dd></div><div><dt>Documento</dt><dd>{item.documentNumber ?? "Sin registrar"}</dd></div><div><dt>Email</dt><dd>{item.email ?? "Sin registrar"}</dd></div><div><dt>Teléfono</dt><dd>{item.phone ?? "Sin registrar"}</dd></div><div><dt>Dirección</dt><dd>{item.address ?? "Sin registrar"}</dd></div></dl>
    </section>
  </div>;
}
