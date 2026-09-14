/* global AbortSignal, Blob, Buffer, FormData, console, fetch, process, URL */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const api = process.env.DEMO_API_URL ?? "http://localhost:3000";
const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const bucket = process.env.STORAGE_BUCKET ?? "ggs-documents";
assert(databaseUrl && supabaseUrl && adminKey && anonKey, "Missing configured environment variables");
assert(["localhost", "127.0.0.1"].includes(new URL(api).hostname), "Demo requires a local API");
assert(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "Demo requires local PostgreSQL");

const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const adminStorage = createClient(supabaseUrl, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
const identities = [];
const templateIds = [];
const generationIds = [];
const fileIds = [];
const storageKeys = [];
let checks = 0;
const pass = (label) => { checks += 1; console.log(`PASS ${checks}: ${label}`); };

async function request(base, path, { token, key, body, method = "GET" } = {}) {
  const response = await fetch(`${base}${path}`, { method, signal: AbortSignal.timeout(30000), headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { apikey: key } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* binary response */ }
  return { status: response.status, data };
}

async function createIdentity(label) {
  const email = `ggs-phase8-${randomUUID()}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const created = await request(supabaseUrl, "/auth/v1/admin/users", { method: "POST", key: adminKey, token: adminKey, body: { email, password, email_confirm: true, user_metadata: { name: `Phase 8 ${label}` } } });
  assert.equal(created.status, 200);
  const identity = { authId: created.data.id };
  identities.push(identity);
  const login = await request(supabaseUrl, "/auth/v1/token?grant_type=password", { method: "POST", key: anonKey, body: { email, password } });
  assert.equal(login.status, 200);
  identity.token = login.data.access_token;
  const me = await request(api, "/auth/me", { token: identity.token });
  assert.equal(me.status, 200);
  identity.userId = me.data.id;
  return identity;
}

async function uploadImage(token) {
  const form = new FormData();
  form.append("file", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")], { type: "image/png" }), "phase8.png");
  const response = await fetch(`${api}/files`, { method: "POST", signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await response.json();
  assert.equal(response.status, 201, JSON.stringify(data));
  fileIds.push(data.id); storageKeys.push(data.storageKey);
  return data;
}

function templateBody() {
  return { name: "Fase 8 dinamica", description: "Fixture de generación", paperSize: "A4", orientation: "PORTRAIT", width: 595.28, height: 841.89, marginTop: 28.35, marginRight: 28.35, marginBottom: 28.35, marginLeft: 28.35, pageCount: 1, elements: [
    { id: randomUUID(), type: "IMAGE", name: "Foto", key: "photo", page: 1, x: 40, y: 40, width: 180, height: 120, rotation: 0, zIndex: 1, required: true, properties: { fitMode: "contain", border: true, borderWidth: 1, borderRadius: 0, text: "", fontSize: 12, color: "#17211c", fill: "#eef2f4", stroke: "#63716a", strokeWidth: 1 } },
    { id: randomUUID(), type: "TEXT", name: "Cliente", key: null, page: 1, x: 40, y: 190, width: 300, height: 30, rotation: 0, zIndex: 2, required: false, properties: { text: "Cliente: {{cliente_nombre}}", fontSize: 14, fontFamily: "Helvetica", color: "#17211c", fill: "#ffffff", stroke: "#63716a", strokeWidth: 1 } },
  ] };
}

try {
  const health = await request(api, "/health");
  assert.equal(health.status, 200); assert.equal(health.data.database, "connected");
  pass("API y PostgreSQL disponibles");
  const owner = await createIdentity("A");
  const other = await createIdentity("B");
  const created = await request(api, "/templates", { token: owner.token, method: "POST", body: templateBody() });
  assert.equal(created.status, 201); assert.equal(created.data.status, "ACTIVE");
  templateIds.push(created.data.id);
  const version = created.data.versions[0];
  const image = await uploadImage(owner.token);
  pass("Plantilla activa, versión y StoredFile de imagen creados");

  const requestKey = randomUUID();
  const body = { templateId: created.data.id, templateVersionId: version.id, requestKey, inputs: { photo: { storedFileId: image.id } }, variables: { cliente_nombre: "Ana" } };
  const generated = await request(api, "/generations", { token: owner.token, method: "POST", body });
  assert.equal(generated.status, 201); assert.equal(generated.data.status, "COMPLETED"); assert(generated.data.outputFileId);
  generationIds.push(generated.data.id);
  const output = await prisma.storedFile.findUniqueOrThrow({ where: { id: generated.data.outputFileId } });
  fileIds.push(output.id); storageKeys.push(output.storageKey);
  assert.equal(output.type, "PDF");
  pass("Generación dinámica completa, con snapshot, correlativo y PDF privado");

  const download = await fetch(`${api}/generations/${generated.data.id}/download`, { headers: { Authorization: `Bearer ${owner.token}` }, signal: AbortSignal.timeout(30000) });
  const pdf = Buffer.from(await download.arrayBuffer());
  assert.equal(download.status, 200); assert(download.headers.get("content-type")?.includes("application/pdf")); assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.equal((await request(api, `/generations/${generated.data.id}/download`, { token: other.token })).status, 404);
  pass("Descarga protegida por propietario y PDF válido");

  const repeated = await request(api, "/generations", { token: owner.token, method: "POST", body });
  assert.equal(repeated.status, 201); assert.equal(repeated.data.id, generated.data.id); assert.equal(repeated.data.number, generated.data.number);
  pass("requestKey idempotente, sin duplicar correlativo");

  const missing = await request(api, "/generations", { token: owner.token, method: "POST", body: { ...body, requestKey: randomUUID(), inputs: {} } });
  assert.equal(missing.status, 400);
  const unknown = await request(api, "/generations", { token: owner.token, method: "POST", body: { ...body, requestKey: randomUUID(), inputs: { other_slot: { storedFileId: image.id } } } });
  assert.equal(unknown.status, 400);
  pass("Slots obligatorios y slots desconocidos se rechazan antes de reservar");

  const concurrent = await Promise.all(Array.from({ length: 20 }, () => request(api, "/generations", { token: owner.token, method: "POST", body: { ...body, requestKey: randomUUID() } })));
  for (const item of concurrent) { assert.equal(item.status, 201); assert.equal(item.data.status, "COMPLETED"); generationIds.push(item.data.id); }
  const numbers = new Set(concurrent.map((item) => item.data.number));
  assert.equal(numbers.size, 20);
  const concurrentOutputs = await prisma.storedFile.findMany({ where: { id: { in: concurrent.map((item) => item.data.outputFileId) } }, select: { id: true, storageKey: true } });
  fileIds.push(...concurrentOutputs.map((item) => item.id)); storageKeys.push(...concurrentOutputs.map((item) => item.storageKey));
  pass("20 generaciones concurrentes reciben correlativos únicos");
  console.log(`RESULT: ${checks} checks passed. Fase 8 end-to-end verified.`);
} catch (error) {
  console.error(`FAIL: ${error instanceof assert.AssertionError ? error.message : "Request or database operation failed"}`);
  process.exitCode = 1;
} finally {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { userId: { in: identities.map((item) => item.userId).filter(Boolean) } } });
      await tx.generationInput.deleteMany({ where: { generationId: { in: generationIds } } });
      await tx.generation.deleteMany({ where: { id: { in: generationIds } } });
      await tx.storedFile.deleteMany({ where: { id: { in: fileIds } } });
      await tx.templateElement.deleteMany({ where: { templateVersion: { templateId: { in: templateIds } } } });
      await tx.templateVersion.deleteMany({ where: { templateId: { in: templateIds } } });
      await tx.template.deleteMany({ where: { id: { in: templateIds } } });
      await tx.user.deleteMany({ where: { authProviderId: { in: identities.map((item) => item.authId) } } });
    });
    if (storageKeys.length) { const removed = await adminStorage.storage.from(bucket).remove(storageKeys); if (removed.error) throw removed.error; }
    for (const identity of identities) await request(supabaseUrl, `/auth/v1/admin/users/${identity.authId}`, { method: "DELETE", key: adminKey, token: adminKey });
    console.log("CLEANUP: fixtures, metadata, Storage objects and identities removed");
  } catch { console.error("CLEANUP FAILED: review disposable Phase 8 fixtures manually"); process.exitCode = 1; }
  await prisma.$disconnect(); await pool.end();
}
