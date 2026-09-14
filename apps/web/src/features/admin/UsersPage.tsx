import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Search, ShieldCheck, UserRoundCheck, UserRoundX } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { apiJson } from "@/lib/api";

interface UserListItem {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  lastLoginAt: string | null;
  organization: { id: string; name: string; slug: string; status: "ACTIVE" | "SUSPENDED" | "ARCHIVED" } | null;
  roles: Array<{ id: string; key: string; name: string; isSystem: boolean }>;
}

interface UserPage {
  items: UserListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface RolePage {
  items: Array<{ id: string; key: string; name: string; isSystem: boolean }>;
}

export default function UsersPage() {
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [roleIdByUser, setRoleIdByUser] = useState<Record<string, string>>({});
  const query = useMemo(() => `/users?page=1&pageSize=50&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ""}`, [search, status]);
  const users = useQuery({ queryKey: ["admin", "users", query], queryFn: () => apiJson<UserPage>(query), staleTime: 10_000 });
  const roles = useQuery({ queryKey: ["admin", "roles"], queryFn: () => apiJson<RolePage>("/roles?page=1&pageSize=100"), staleTime: 60_000 });
  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => apiJson<UserListItem>(`/users/${id}/${active ? "activate" : "deactivate"}`, { method: "POST" }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
  const assignRole = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) => apiJson<UserListItem>(`/users/${userId}/roles`, { method: "POST", body: JSON.stringify({ roleIds: [roleId] }) }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  return <div className="studio-page">
    <div className="page-heading"><div><p className="eyebrow">Administración</p><h2>Usuarios</h2><p className="page-subtitle">Consulta cuentas, estado operativo y roles asignados desde permisos reales del backend.</p></div></div>
    <section className="admin-controls"><label className="field"><span>Buscar</span><span className="input-with-icon"><Search className="size-4" /><input value={search} placeholder="Nombre o email" onChange={(event) => setSearch(event.target.value)} /></span></label><label className="field"><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option><option value="ACTIVE">Activos</option><option value="INACTIVE">Inactivos</option></select></label></section>
    {users.isPending ? <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando usuarios...</div> : users.isError ? <section className="empty-state" role="alert"><h2>No se pudieron cargar usuarios</h2><p>{users.error.message}</p><Button onClick={() => void users.refetch()}>Reintentar</Button></section> : <div className="admin-table" role="table" aria-label="Usuarios"><div className="admin-head" role="row"><span>Usuario</span><span>Organización</span><span>Roles</span><span>Estado</span><span>Último acceso</span><span>Acciones</span></div>{users.data.items.map((user) => { const selectedRoleId = roleIdByUser[user.id] ?? ""; return <div className="admin-row" role="row" key={user.id}><span><strong>{user.name ?? user.email}</strong><small>{user.email}</small></span><span>{user.organization ? <><strong>{user.organization.name}</strong><small>{user.organization.slug}</small></> : "Plataforma"}</span><span className="role-chip-list">{user.roles.map((role) => <small className="role-chip" key={role.id}>{role.key}</small>)}</span><span className={`status ${user.isActive ? "status-completed" : "status-failed"}`}>{user.status}</span><span>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("es-PE") : "Sin acceso"}</span><span className="admin-actions"><select aria-label={`Asignar rol a ${user.email}`} value={selectedRoleId} onChange={(event) => setRoleIdByUser((current) => ({ ...current, [user.id]: event.target.value }))}><option value="">Rol...</option>{(roles.data?.items ?? []).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><Button variant="ghost" size="icon" title="Asignar rol" aria-label={`Asignar rol a ${user.email}`} disabled={!selectedRoleId || assignRole.isPending} onClick={() => void assignRole.mutate({ userId: user.id, roleId: selectedRoleId })}><ShieldCheck className="size-4" /></Button><Button variant="ghost" size="icon" title={user.isActive ? "Desactivar" : "Activar"} aria-label={user.isActive ? `Desactivar ${user.email}` : `Activar ${user.email}`} disabled={setActive.isPending} onClick={() => void setActive.mutate({ id: user.id, active: !user.isActive })}>{user.isActive ? <UserRoundX className="size-4" /> : <UserRoundCheck className="size-4" />}</Button></span></div>; })}</div>}
  </div>;
}
