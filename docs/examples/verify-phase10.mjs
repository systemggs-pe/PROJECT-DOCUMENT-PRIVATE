/* global AbortSignal, console, fetch, process, URL */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const api = process.env.DEMO_API_URL ?? "http://localhost:3000";
const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
assert(databaseUrl && supabaseUrl && adminKey && anonKey, "Missing configured environment variables");
assert(["localhost", "127.0.0.1"].includes(new URL(api).hostname), "Demo requires a local API");
assert(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "Demo requires local PostgreSQL");

const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const identities = [];
const localUserIds = [];
let checks = 0;
const pass = (label) => { checks += 1; console.log(`PASS ${checks}: ${label}`); };

async function request(base, path, { token, key, body, method = "GET" } = {}) {
  const response = await fetch(`${base}${path}`, { method, signal: AbortSignal.timeout(30000), headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { apikey: key } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* non-json */ }
  return { status: response.status, data };
}

async function createIdentity(label) {
  const email = `ggs-phase10-${label}-${randomUUID()}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const created = await request(supabaseUrl, "/auth/v1/admin/users", { method: "POST", key: adminKey, token: adminKey, body: { email, password, email_confirm: true, user_metadata: { name: `Phase 10 ${label}` } } });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const login = await request(supabaseUrl, "/auth/v1/token?grant_type=password", { method: "POST", key: anonKey, body: { email, password } });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  const identity = { authId: created.data.id, token: login.data.access_token };
  identities.push(identity);
  const me = await request(api, "/auth/me", { token: identity.token });
  assert.equal(me.status, 200, JSON.stringify(me.data));
  identity.userId = me.data.id;
  localUserIds.push(me.data.id);
  return identity;
}

async function assignRole(userId, key) {
  const role = await prisma.role.findUniqueOrThrow({ where: { key }, select: { id: true } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId, roleId: role.id } }, update: {}, create: { userId, roleId: role.id } });
  return role.id;
}

try {
  const health = await request(api, "/health");
  assert.equal(health.status, 200); assert.equal(health.data.database, "connected");
  pass("API y PostgreSQL disponibles");

  const normal = await createIdentity("user");
  const admin = await createIdentity("admin");
  const superadmin = await createIdentity("superadmin");
  const adminRoleId = await assignRole(admin.userId, "ADMIN");
  const superRoleId = await assignRole(superadmin.userId, "SUPERADMIN");
  pass("Identidades temporales creadas y roles base asignados desde DB controlada");

  const normalMe = await request(api, "/auth/me", { token: normal.token });
  assert.equal(normalMe.status, 200);
  assert(normalMe.data.roles.some((role) => role.key === "USER"));
  assert(!normalMe.data.permissions.includes("users.read"));
  assert.equal((await request(api, "/users", { token: normal.token })).status, 403);
  assert.equal((await request(api, "/roles", { token: normal.token })).status, 403);
  pass("USER no accede a usuarios ni roles por URL directa");

  const managedEmail = `managed-${randomUUID()}@example.com`;
  const createdManaged = await request(api, "/users", { token: admin.token, method: "POST", body: { email: managedEmail, name: "Managed User" } });
  assert.equal(createdManaged.status, 201, JSON.stringify(createdManaged.data));
  localUserIds.push(createdManaged.data.id);
  const adminUsers = await request(api, "/users", { token: admin.token });
  assert.equal(adminUsers.status, 200);
  assert(adminUsers.data.items.some((user) => user.id === createdManaged.data.id));
  pass("ADMIN lista y crea usuarios dentro de su ambito");

  const blockedSuperAssign = await request(api, `/users/${createdManaged.data.id}/roles`, { token: admin.token, method: "POST", body: { roleIds: [superRoleId] } });
  assert.equal(blockedSuperAssign.status, 403, JSON.stringify(blockedSuperAssign.data));
  const blockedSystemRoleEdit = await request(api, `/roles/${adminRoleId}`, { token: admin.token, method: "PATCH", body: { name: "Administrador alterado" } });
  assert.equal(blockedSystemRoleEdit.status, 403, JSON.stringify(blockedSystemRoleEdit.data));
  pass("ADMIN no asigna SUPERADMIN ni modifica roles del sistema");

  const superUsers = await request(api, "/users", { token: superadmin.token });
  const superRoles = await request(api, "/roles", { token: superadmin.token });
  const catalog = await request(api, "/permissions", { token: superadmin.token });
  assert.equal(superUsers.status, 200);
  assert.equal(superRoles.status, 200);
  assert.equal(catalog.status, 200);
  assert(catalog.data.items.length >= 26);
  pass("SUPERADMIN accede a usuarios, roles y catalogo de permisos");

  const selfEscalation = await request(api, `/users/${admin.userId}/roles`, { token: admin.token, method: "POST", body: { roleIds: [adminRoleId] } });
  assert.equal(selfEscalation.status, 403, JSON.stringify(selfEscalation.data));
  pass("Modificacion de roles propios queda bloqueada");

  console.log(`RESULT: ${checks} checks passed. Fase 10 RBAC verified.`);
} catch (error) {
  console.error(`FAIL: ${error instanceof assert.AssertionError ? error.message : error?.message ?? "Request or database operation failed"}`);
  process.exitCode = 1;
} finally {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { OR: [{ userId: { in: localUserIds } }, { entityId: { in: localUserIds } }] } });
      await tx.user.deleteMany({ where: { id: { in: localUserIds } } });
    });
    for (const identity of identities) await request(supabaseUrl, `/auth/v1/admin/users/${identity.authId}`, { method: "DELETE", key: adminKey, token: adminKey });
    console.log("CLEANUP: Phase 10 users, audit rows and identities removed");
  } catch {
    console.error("CLEANUP FAILED: review disposable Phase 10 fixtures manually");
    process.exitCode = 1;
  }
  await prisma.$disconnect(); await pool.end();
}
