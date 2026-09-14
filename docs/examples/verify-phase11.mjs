/* global AbortSignal, console, fetch, process */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const api = process.env.DEMO_API_URL ?? "http://localhost:3000";
const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
assert(databaseUrl && supabaseUrl && serviceKey && anonKey, "Faltan variables de entorno para la verificacion");
assert(["localhost", "127.0.0.1"].includes(new URL(api).hostname), "La verificacion requiere una API local");
assert(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "La verificacion requiere PostgreSQL local");

const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const identities = [];
const userIds = [];
const organizationIds = [];
const templateIds = [];
const generationIds = [];
let checks = 0;
const pass = (label) => { checks += 1; console.log(`PASS ${checks}: ${label}`); };

async function request(base, path, { token, key, body, method = "GET" } = {}) {
  const response = await fetch(`${base}${path}`, { method, signal: AbortSignal.timeout(30000), headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { apikey: key } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* empty response */ }
  return { status: response.status, data };
}

async function createIdentity(label) {
  const email = `ggs-phase11-${label}-${randomUUID()}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const created = await request(supabaseUrl, "/auth/v1/admin/users", { method: "POST", key: serviceKey, token: serviceKey, body: { email, password, email_confirm: true, user_metadata: { name: `Phase 11 ${label}` } } });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const login = await request(supabaseUrl, "/auth/v1/token?grant_type=password", { method: "POST", key: anonKey, body: { email, password } });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  const identity = { authId: created.data.id, token: login.data.access_token };
  identities.push(identity);
  const me = await request(api, "/auth/me", { token: identity.token });
  assert.equal(me.status, 200, JSON.stringify(me.data));
  identity.userId = me.data.id; userIds.push(me.data.id);
  return identity;
}

async function assignRole(userId, key) {
  const role = await prisma.role.findUniqueOrThrow({ where: { key }, select: { id: true } });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId, roleId: role.id } }, update: {}, create: { userId, roleId: role.id } });
}

async function refresh(identity) {
  const me = await request(api, "/auth/me", { token: identity.token });
  assert.equal(me.status, 200, JSON.stringify(me.data));
  return me.data;
}

try {
  const health = await request(api, "/health");
  assert.equal(health.status, 200); assert.equal(health.data.database, "connected");
  pass("API y PostgreSQL disponibles");

  const superadmin = await createIdentity("superadmin");
  const adminA = await createIdentity("admin-a");
  const adminB = await createIdentity("admin-b");
  await assignRole(superadmin.userId, "SUPERADMIN");
  await assignRole(adminA.userId, "ADMIN");
  await assignRole(adminB.userId, "ADMIN");
  await refresh(superadmin);
  pass("Identidades temporales y roles multi-organizacion preparados");

  const orgAResult = await request(api, "/organizations", { token: superadmin.token, method: "POST", body: { name: "Phase 11 Organization A", slug: `phase11-a-${randomUUID().slice(0, 8)}` } });
  const orgBResult = await request(api, "/organizations", { token: superadmin.token, method: "POST", body: { name: "Phase 11 Organization B", slug: `phase11-b-${randomUUID().slice(0, 8)}` } });
  assert.equal(orgAResult.status, 201, JSON.stringify(orgAResult.data)); assert.equal(orgBResult.status, 201, JSON.stringify(orgBResult.data));
  const orgA = orgAResult.data; const orgB = orgBResult.data;
  organizationIds.push(orgA.id, orgB.id);
  await prisma.user.update({ where: { id: adminA.userId }, data: { organizationId: orgA.id } });
  await prisma.user.update({ where: { id: adminB.userId }, data: { organizationId: orgB.id } });
  assert.equal((await refresh(adminA)).organization.id, orgA.id); assert.equal((await refresh(adminB)).organization.id, orgB.id);
  pass("SUPERADMIN crea organizaciones y cada ADMIN queda asignado a su tenant");

  const templateResult = await request(api, "/templates", { token: adminA.token, method: "POST", body: { name: "Plantilla privada A", description: "Fixture de aislamiento" } });
  assert.equal(templateResult.status, 201, JSON.stringify(templateResult.data));
  templateIds.push(templateResult.data.id);
  const versionId = templateResult.data.activeVersion?.id ?? templateResult.data.versions?.[0]?.id;
  assert(versionId, "La plantilla debe devolver una version activa");
  assert.equal((await request(api, `/templates/${templateResult.data.id}`, { token: adminB.token })).status, 404);
  const bTemplates = await request(api, "/templates", { token: adminB.token });
  assert.equal(bTemplates.status, 200); assert(!bTemplates.data.items.some((item) => item.id === templateResult.data.id));
  pass("Las plantillas quedan aisladas por organizacion y no se enumeran entre tenants");

  const generationResult = await request(api, "/generations", { token: adminA.token, method: "POST", body: { templateVersionId: versionId, requestKey: randomUUID(), inputs: [], variables: {} } });
  assert.equal(generationResult.status, 201, JSON.stringify(generationResult.data));
  generationIds.push(generationResult.data.id);
  assert.equal((await request(api, `/generations/${generationResult.data.id}`, { token: adminB.token })).status, 404);
  const record = await prisma.generation.findUniqueOrThrow({ where: { id: generationResult.data.id }, select: { organizationId: true, outputFile: { select: { storageKey: true } } } });
  assert.equal(record.organizationId, orgA.id); assert(record.outputFile?.storageKey.startsWith(`organizations/${orgA.id}/generations/`));
  pass("Las generaciones y sus archivos PDF conservan el tenant correcto");

  assert([200, 201].includes((await request(api, `/organizations/${orgA.id}/suspend`, { token: superadmin.token, method: "POST" })).status));
  assert.equal((await request(api, "/templates", { token: adminA.token })).status, 403);
  assert([200, 201].includes((await request(api, `/organizations/${orgA.id}/activate`, { token: superadmin.token, method: "POST" })).status));
  assert.equal((await request(api, "/templates", { token: adminA.token })).status, 200);
  assert.equal((await request(api, "/organization", { token: adminA.token })).data.id, orgA.id);
  pass("La suspension bloquea operaciones y la activacion las restaura");

  const organizationList = await request(api, "/organizations", { token: superadmin.token });
  assert.equal(organizationList.status, 200); assert(organizationList.data.items.some((item) => item.id === orgA.id));
  pass("SUPERADMIN consulta el catalogo y los contadores de organizaciones");
  console.log(`RESULT: ${checks} checks passed. Fase 11 multi-tenancy verified.`);
} catch (error) {
  console.error(`FAIL: ${error instanceof assert.AssertionError ? error.message : error?.message ?? "Fallo de request o base de datos"}`);
  process.exitCode = 1;
} finally {
  try {
    for (const generationId of generationIds) await request(api, `/generations/${generationId}`, { token: identities[0]?.token, method: "DELETE" });
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { entityId: { in: [...userIds, ...organizationIds, ...templateIds, ...generationIds] } }] } });
      await tx.generationInput.deleteMany({ where: { generationId: { in: generationIds } } });
      const outputFiles = await tx.generation.findMany({ where: { id: { in: generationIds } }, select: { outputFileId: true } });
      await tx.storedFile.deleteMany({ where: { id: { in: outputFiles.map((item) => item.outputFileId).filter(Boolean) } } });
      await tx.generation.deleteMany({ where: { id: { in: generationIds } } });
      await tx.templateElement.deleteMany({ where: { templateVersion: { templateId: { in: templateIds } } } });
      await tx.templateVersion.deleteMany({ where: { templateId: { in: templateIds } } });
      await tx.template.deleteMany({ where: { id: { in: templateIds } } });
      await tx.userRole.deleteMany({ where: { userId: { in: userIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
      await tx.organization.deleteMany({ where: { id: { in: organizationIds } } });
    });
    for (const identity of identities) await request(supabaseUrl, `/auth/v1/admin/users/${identity.authId}`, { method: "DELETE", key: serviceKey, token: serviceKey });
    console.log("CLEANUP: fixtures de Fase 11 eliminados");
  } catch (error) { console.error(`CLEANUP FAILED: ${error?.message ?? "revisar fixtures temporales"}`); process.exitCode = 1; }
  await prisma.$disconnect(); await pool.end();
}
