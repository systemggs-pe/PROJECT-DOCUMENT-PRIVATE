/* global AbortSignal, Blob, Buffer, FormData, fetch, console, process, URL */
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
assert(["localhost", "127.0.0.1"].includes(new URL(api).hostname) && ["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "Phase 9 requires local API and PostgreSQL");
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const adminStorage = createClient(supabaseUrl, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
const identities = []; const templateIds = []; const generationIds = []; const fileIds = []; const storageKeys = []; let checks = 0;
const pass = (label) => { checks += 1; console.log(`PASS ${checks}: ${label}`); };

async function request(base, path, { token, key, body, method = "GET" } = {}) {
  const response = await fetch(`${base}${path}`, { method, signal: AbortSignal.timeout(30000), headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { apikey: key } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text(); let data = null; try { data = JSON.parse(text); } catch { /* binary response */ }
  return { response, data };
}

async function identity(label) {
  const email = `ggs-phase9-${randomUUID()}@example.com`; const password = randomBytes(24).toString("base64url");
  const created = await request(supabaseUrl, "/auth/v1/admin/users", { method: "POST", key: adminKey, token: adminKey, body: { email, password, email_confirm: true, user_metadata: { name: `Phase 9 ${label}` } } });
  assert.equal(created.response.status, 200); identities.push({ authId: created.data.id });
  const login = await request(supabaseUrl, "/auth/v1/token?grant_type=password", { method: "POST", key: anonKey, body: { email, password } });
  assert.equal(login.response.status, 200); const item = identities.at(-1); item.token = login.data.access_token;
  const me = await request(api, "/auth/me", { token: item.token }); assert.equal(me.response.status, 200); item.userId = me.data.id; return item;
}

function templateBody(name) { return { name, description: "Fixture de historial", paperSize: "A4", orientation: "PORTRAIT", width: 595.28, height: 841.89, marginTop: 28.35, marginRight: 28.35, marginBottom: 28.35, marginLeft: 28.35, pageCount: 1, elements: [{ id: randomUUID(), type: "IMAGE", name: "Foto", key: "photo", page: 1, x: 40, y: 40, width: 180, height: 120, rotation: 0, zIndex: 1, required: true, properties: { fitMode: "contain", border: true, borderWidth: 1, borderRadius: 0, text: "", fontSize: 12, color: "#17211c", fill: "#eef2f4", stroke: "#63716a", strokeWidth: 1 } }, { id: randomUUID(), type: "TEXT", name: "Cliente", key: null, page: 1, x: 40, y: 190, width: 300, height: 30, rotation: 0, zIndex: 2, required: false, properties: { text: "Cliente: {{cliente_nombre}}", fontSize: 14, fontFamily: "Helvetica", color: "#17211c", fill: "#ffffff", stroke: "#63716a", strokeWidth: 1 } }] }; }

async function upload(token) {
  const form = new FormData(); form.append("file", new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")], { type: "image/png" }), "history.png");
  const response = await fetch(`${api}/files`, { method: "POST", signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}` }, body: form }); const data = await response.json(); assert.equal(response.status, 201); fileIds.push(data.id); storageKeys.push(data.storageKey); return data;
}

async function generate(user, template, image, name) {
  const result = await request(api, "/generations", { token: user.token, method: "POST", body: { templateId: template.id, templateVersionId: template.versions[0].id, requestKey: randomUUID(), inputs: { photo: { storedFileId: image.id } }, variables: { cliente_nombre: name } } });
  assert.equal(result.response.status, 201); assert.equal(result.data.status, "COMPLETED"); generationIds.push(result.data.id); const output = await prisma.storedFile.findUniqueOrThrow({ where: { id: result.data.outputFileId }, select: { id: true, storageKey: true } }); fileIds.push(output.id); storageKeys.push(output.storageKey); return result.data;
}

try {
  const health = await request(api, "/health"); assert.equal(health.response.status, 200); assert.equal(health.data.database, "connected");
  const a = await identity("A"); const b = await identity("B");
  const templateAResult = await request(api, "/templates", { token: a.token, method: "POST", body: templateBody("Historial A") }); assert.equal(templateAResult.response.status, 201); templateIds.push(templateAResult.data.id);
  const templateBResult = await request(api, "/templates", { token: b.token, method: "POST", body: templateBody("Historial B") }); assert.equal(templateBResult.response.status, 201); templateIds.push(templateBResult.data.id);
  const imageA = await upload(a.token); const imageB = await upload(b.token); const generationsA = await Promise.all([generate(a, templateAResult.data, imageA, "Ana"), generate(a, templateAResult.data, imageA, "Bea"), generate(a, templateAResult.data, imageA, "Cora")]); const generationB = await generate(b, templateBResult.data, imageB, "Bruno");
  pass("Se crean generaciones reales para dos propietarios");

  const firstPage = await request(api, "/generations?page=1&pageSize=2&sort=number&order=asc", { token: a.token }); const secondPage = await request(api, "/generations?page=2&pageSize=2&sort=number&order=asc", { token: a.token });
  assert.equal(firstPage.response.status, 200); assert.equal(firstPage.data.items.length, 2); assert.equal(secondPage.data.items.length, 1); assert.equal(firstPage.data.total, 3); pass("Paginación y sorting se ejecutan en PostgreSQL");
  const search = await request(api, `/generations?search=${encodeURIComponent(generationsA[0].number)}`, { token: a.token }); assert.equal(search.data.items.length, 1); assert.equal(search.data.items[0].id, generationsA[0].id);
  const date = new Date().toISOString().slice(0, 10); const combined = await request(api, `/generations?search=Historial%20A&status=COMPLETED&templateId=${templateAResult.data.id}&from=${date}&to=${date}`, { token: a.token }); assert.equal(combined.data.total, 3); pass("Búsqueda por número y filtros combinados funcionan");
  assert.equal((await request(api, "/generations?sort=createdAt;DROP%20TABLE", { token: a.token })).response.status, 400); assert.equal((await request(api, "/generations?pageSize=101", { token: a.token })).response.status, 400); pass("Parámetros inválidos y pageSize excesivo son rechazados");

  const detail = await request(api, `/generations/${generationsA[0].id}`, { token: a.token }); assert.equal(detail.response.status, 200); assert.equal(detail.data.template.id, templateAResult.data.id); assert.equal(detail.data.templateVersion.id, templateAResult.data.versions[0].id); assert.equal(detail.data.inputs.length, 2);
  const signed = await request(api, `/generations/${generationsA[0].id}/signed-url`, { token: a.token }); assert.equal(signed.response.status, 200); assert.equal(signed.data.expiresIn, 300); assert(signed.data.url);
  const download = await fetch(`${api}/generations/${generationsA[0].id}/download`, { headers: { Authorization: `Bearer ${a.token}` }, signal: AbortSignal.timeout(30000) }); const pdf = Buffer.from(await download.arrayBuffer()); assert.equal(download.status, 200); assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-"); pass("Detalle exacto, inputs, signed URL temporal y descarga funcionan");

  assert.equal((await request(api, `/generations/${generationB.id}`, { token: a.token })).response.status, 404); assert.equal((await request(api, `/generations/${generationB.id}/download`, { token: a.token })).response.status, 404); assert.equal((await request(api, `/generations/${generationB.id}`, { token: a.token, method: "DELETE" })).response.status, 404); assert.equal((await request(api, `/generations/${generationsA[0].id}`, { token: b.token })).response.status, 404); pass("Aislamiento cross-user protege detalle, descarga y delete");

  const deleted = generationsA[2]; const output = await prisma.generation.findUniqueOrThrow({ where: { id: deleted.id }, select: { outputFileId: true, outputFile: { select: { storageKey: true } } } }); const deletedResult = await request(api, `/generations/${deleted.id}`, { token: a.token, method: "DELETE" }); assert.equal(deletedResult.response.status, 200); assert.equal((await request(api, `/generations/${deleted.id}`, { token: a.token })).response.status, 404); const audit = await prisma.auditLog.findFirst({ where: { entityId: deleted.id, action: "DELETE" } }); assert(audit); if (output.outputFile?.storageKey) storageKeys.splice(storageKeys.indexOf(output.outputFile.storageKey), 1); pass("Delete consistente elimina Generation, PDF no referenciado y conserva AuditLog");
  console.log(`RESULT: ${checks} checks passed. Fase 9 history verified.`);
} catch (error) { console.error(`FAIL: ${error instanceof assert.AssertionError ? error.message : "Request or database operation failed"}`); process.exitCode = 1; }
finally {
  try { await prisma.$transaction(async (tx) => { await tx.auditLog.deleteMany({ where: { userId: { in: identities.map((item) => item.userId).filter(Boolean) } } }); await tx.generationInput.deleteMany({ where: { generationId: { in: generationIds } } }); await tx.generation.deleteMany({ where: { id: { in: generationIds } } }); await tx.storedFile.deleteMany({ where: { id: { in: fileIds } } }); await tx.templateElement.deleteMany({ where: { templateVersion: { templateId: { in: templateIds } } } }); await tx.templateVersion.deleteMany({ where: { templateId: { in: templateIds } } }); await tx.template.deleteMany({ where: { id: { in: templateIds } } }); await tx.user.deleteMany({ where: { authProviderId: { in: identities.map((item) => item.authId) } } }); }); if (storageKeys.length) { const removed = await adminStorage.storage.from(bucket).remove(storageKeys); if (removed.error) throw removed.error; } for (const item of identities) await request(supabaseUrl, `/auth/v1/admin/users/${item.authId}`, { method: "DELETE", key: adminKey, token: adminKey }); console.log("CLEANUP: Phase 9 fixtures removed"); } catch { console.error("CLEANUP FAILED: review disposable Phase 9 fixtures manually"); process.exitCode = 1; } await prisma.$disconnect(); await pool.end();
}
