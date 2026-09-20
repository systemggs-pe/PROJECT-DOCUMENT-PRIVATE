import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Plus, Save, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiJson } from "@/lib/api";

interface PermissionItem {
  id: string;
  key: string;
  name: string;
  group: string;
  groupLabel: string;
}

interface RoleItem {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissions: PermissionItem[];
  userCount: number;
  permissionCount: number;
}

interface RolePage {
  items: RoleItem[];
}

export default function RolesPage() {
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [draftName, setDraftName] = useState("Editor de documentos");
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<string>>(new Set());
  const roles = useQuery({ queryKey: ["admin", "roles", search], queryFn: () => apiJson<RolePage>(`/roles?page=1&pageSize=100&search=${encodeURIComponent(search)}`), staleTime: 10_000 });
  const permissions = useQuery({ queryKey: ["admin", "permissions"], queryFn: () => apiJson<{ items: PermissionItem[] }>("/permissions"), staleTime: 60_000 });
  const selectedRole = roles.data?.items.find((role) => role.id === selectedRoleId);
  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, PermissionItem[]>();
    for (const permission of permissions.data?.items ?? []) groups.set(permission.groupLabel, [...(groups.get(permission.groupLabel) ?? []), permission]);
    return [...groups.entries()];
  }, [permissions.data?.items]);
  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({ name: selectedRole?.name ?? draftName, permissionIds: [...selectedPermissionIds] });
      return selectedRole ? apiJson<RoleItem>(`/roles/${selectedRole.id}`, { method: "PATCH", body }) : apiJson<RoleItem>("/roles", { method: "POST", body });
    },
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["admin", "roles"] }),
  });

  function selectRole(role: RoleItem) {
    setSelectedRoleId(role.id);
    setDraftName(role.name);
    setSelectedPermissionIds(new Set(role.permissions.map((permission) => permission.id)));
  }

  function togglePermission(id: string) {
    setSelectedPermissionIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return <div className="roles-layout">
    <section className="studio-page">
      <div className="page-heading"><div><p className="eyebrow">Administración</p><h2>Roles</h2><p className="page-subtitle">Define qué puede hacer cada persona dentro del sistema.</p></div><Button variant="ghost" onClick={() => { setSelectedRoleId(""); setDraftName("Editor de documentos"); setSelectedPermissionIds(new Set()); }}><Plus className="mr-2 size-4" />Nuevo rol</Button></div>
      <label className="history-search"><Search className="size-4" /><span className="sr-only">Buscar rol</span><input value={search} placeholder="Buscar rol..." onChange={(event) => setSearch(event.target.value)} /></label>
      {roles.isPending ? <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando roles...</div> : roles.isError ? <section className="empty-state" role="alert"><h2>No se pudieron cargar roles</h2><p>{roles.error.message}</p></section> : <div className="role-list">{roles.data.items.map((role) => <button className={`role-row ${role.id === selectedRoleId ? "is-selected" : ""}`} key={role.id} type="button" onClick={() => selectRole(role)}><span><strong>{role.name}</strong><small>{role.key}</small></span><span>{role.userCount} usuarios</span><span>{role.permissionCount} permisos</span>{role.isSystem && <ShieldCheck className="size-4" aria-label="Rol del sistema" />}</button>)}</div>}
    </section>
    <aside className="permission-editor">
      <div className="section-heading"><div><p className="eyebrow">Permisos</p><h3>{selectedRole ? selectedRole.name : "Nuevo rol"}</h3></div><Button onClick={() => void save.mutate()} disabled={save.isPending || (!selectedRole && draftName.trim().length < 2)}><Save className="mr-2 size-4" />Guardar cambios</Button></div>
      {!selectedRole && <label className="field"><span>Nombre</span><input value={draftName} onChange={(event) => setDraftName(event.target.value)} /></label>}
      {save.error && <p className="studio-error" role="alert">{save.error.message}</p>}
      {permissions.isPending ? <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando permisos...</div> : groupedPermissions.map(([group, items]) => <fieldset className="permission-group" key={group}><legend>{group}</legend>{items.map((permission) => <label className="inline-check" key={permission.id}><input type="checkbox" checked={selectedPermissionIds.has(permission.id)} onChange={() => togglePermission(permission.id)} />{permission.key}</label>)}</fieldset>)}
    </aside>
  </div>;
}
