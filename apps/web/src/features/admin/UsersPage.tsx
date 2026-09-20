import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Plus, Save, Search, ShieldCheck, UserRoundCheck, UserRoundX } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { can, useCurrentIdentity } from "@/features/auth/authorization";
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
  roles: Array<{ id: string; key: string; name: string; isSystem: boolean }>;
}

interface UserPage {
  items: UserListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface RoleItem {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
}

interface RolePage {
  items: RoleItem[];
}

const emptyDraft = { email: "", name: "", roleId: "", isActive: true };

export default function UsersPage() {
  const cache = useQueryClient();
  const identity = useCurrentIdentity();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [draft, setDraft] = useState(emptyDraft);
  const [roleIdByUser, setRoleIdByUser] = useState<Record<string, string>>({});
  const [nameByUser, setNameByUser] = useState<Record<string, string>>({});
  const query = useMemo(() => `/users?page=1&pageSize=50&search=${encodeURIComponent(search)}${status ? `&status=${status}` : ""}${role ? `&role=${encodeURIComponent(role)}` : ""}`, [search, role, status]);
  const users = useQuery({ queryKey: ["admin", "users", query], queryFn: () => apiJson<UserPage>(query), staleTime: 10_000 });
  const roles = useQuery({ queryKey: ["admin", "roles"], queryFn: () => apiJson<RolePage>("/roles?page=1&pageSize=100"), staleTime: 60_000 });

  const canCreate = can(identity.data, "users.create");
  const canUpdate = can(identity.data, "users.update");
  const canDeactivate = can(identity.data, "users.deactivate");
  const canAssignRole = can(identity.data, "users.update") && can(identity.data, "permissions.assign");

  const createUser = useMutation({
    mutationFn: () => apiJson<UserListItem>("/users", {
      method: "POST",
      body: JSON.stringify({
        email: draft.email,
        name: draft.name.trim() || undefined,
        isActive: draft.isActive,
        roleIds: draft.roleId ? [draft.roleId] : [],
      }),
    }),
    onSuccess: () => {
      setDraft(emptyDraft);
      void cache.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
  const updateUser = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => apiJson<UserListItem>(`/users/${id}`, { method: "PATCH", body: JSON.stringify({ name: name.trim() || null }) }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => apiJson<UserListItem>(`/users/${id}/${active ? "activate" : "deactivate"}`, { method: "POST" }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
  const assignRole = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) => apiJson<UserListItem>(`/users/${userId}/roles`, { method: "POST", body: JSON.stringify({ roleIds: [roleId] }) }),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  return <div className="studio-page">
    <div className="page-heading">
      <div><p className="eyebrow">Administración</p><h2>Usuarios</h2><p className="page-subtitle">Controla cuentas, estado y roles de las personas que usan el sistema.</p></div>
    </div>

    {canCreate && <section className="admin-controls">
      <label className="field"><span>Correo</span><input type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></label>
      <label className="field"><span>Nombre</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
      <label className="field"><span>Rol inicial</span><select value={draft.roleId} onChange={(event) => setDraft((current) => ({ ...current, roleId: event.target.value }))}><option value="">Sin rol</option>{roles.data?.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="inline-check"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))} />Activo</label>
      <Button onClick={() => void createUser.mutate()} disabled={createUser.isPending || !draft.email.trim()}><Plus className="mr-2 size-4" />Agregar usuario</Button>
    </section>}
    {createUser.error && <p className="studio-error" role="alert">{createUser.error.message}</p>}

    <section className="admin-controls">
      <label className="field"><span>Buscar</span><span className="input-with-icon"><Search className="size-4" /><input value={search} placeholder="Nombre o correo" onChange={(event) => setSearch(event.target.value)} /></span></label>
      <label className="field"><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option><option value="ACTIVE">Activos</option><option value="INACTIVE">Inactivos</option></select></label>
      <label className="field"><span>Rol</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="">Todos</option>{roles.data?.items.map((item) => <option key={item.id} value={item.key}>{item.name}</option>)}</select></label>
    </section>

    {users.isPending ? <div className="loading-row" role="status"><LoaderCircle className="size-4 animate-spin" />Cargando usuarios...</div> : users.isError ? <section className="empty-state" role="alert"><h2>No se pudieron cargar usuarios</h2><p>{users.error.message}</p><Button onClick={() => void users.refetch()}>Reintentar</Button></section> : <div className="admin-table" role="table" aria-label="Usuarios">
      <div className="admin-head" role="row"><span>Usuario</span><span>Roles</span><span>Estado</span><span>Último acceso</span><span>Acciones</span></div>
      {users.data.items.map((user) => {
        const selectedRoleId = roleIdByUser[user.id] ?? "";
        const editableName = nameByUser[user.id] ?? user.name ?? "";
        return <div className="admin-row" role="row" key={user.id}>
          <span><strong>{user.name ?? user.email}</strong><small>{user.email}</small>{canUpdate && <input aria-label={`Nombre de ${user.email}`} value={editableName} onChange={(event) => setNameByUser((current) => ({ ...current, [user.id]: event.target.value }))} />}</span>
          <span className="role-chip-list">{user.roles.map((item) => <small className="role-chip" key={item.id}>{item.key}</small>)}</span>
          <span className={`status ${user.isActive ? "status-completed" : "status-failed"}`}>{user.isActive ? "Activo" : "Inactivo"}</span>
          <span>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("es-PE") : "Sin acceso"}</span>
          <span className="admin-actions">
            {canUpdate && <Button variant="ghost" size="icon" title="Guardar nombre" aria-label={`Guardar nombre de ${user.email}`} disabled={updateUser.isPending} onClick={() => void updateUser.mutate({ id: user.id, name: editableName })}><Save className="size-4" /></Button>}
            {canAssignRole && <select aria-label={`Asignar rol a ${user.email}`} value={selectedRoleId} onChange={(event) => setRoleIdByUser((current) => ({ ...current, [user.id]: event.target.value }))}><option value="">Rol...</option>{(roles.data?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
            {canAssignRole && <Button variant="ghost" size="icon" title="Asignar rol" aria-label={`Asignar rol a ${user.email}`} disabled={!selectedRoleId || assignRole.isPending} onClick={() => void assignRole.mutate({ userId: user.id, roleId: selectedRoleId })}><ShieldCheck className="size-4" /></Button>}
            {canDeactivate && <Button variant="ghost" size="icon" title={user.isActive ? "Desactivar" : "Activar"} aria-label={user.isActive ? `Desactivar ${user.email}` : `Activar ${user.email}`} disabled={setActive.isPending} onClick={() => { if (!user.isActive || window.confirm(`Desactivar a ${user.email}?`)) void setActive.mutate({ id: user.id, active: !user.isActive }); }}>{user.isActive ? <UserRoundX className="size-4" /> : <UserRoundCheck className="size-4" />}</Button>}
          </span>
        </div>;
      })}
    </div>}
    {(updateUser.error || assignRole.error || setActive.error) && <p className="studio-error" role="alert">{updateUser.error?.message ?? assignRole.error?.message ?? setActive.error?.message}</p>}
  </div>;
}
