/* global AbortSignal, Blob, Buffer, console, fetch, FormData, process, URL */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Run from the repository root. Only disposable identities, files and fixtures are removed.
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

function pass(label) {
  checks += 1;
  console.log(`PASS ${checks}: ${label}`);
}

async function request(base, path, { token, key, body, method = "GET" } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    signal: AbortSignal.timeout(30000),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { apikey: key } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { status: response.status, data };
}

async function uploadImage(token, name) {
  const form = new FormData();
  form.append("file", new Blob([demoPng()], { type: "image/png" }), name);
  const response = await fetch(`${api}/files`, {
    method: "POST",
    signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  assert.equal(response.status, 201, `Image upload failed with status ${response.status}: ${JSON.stringify(data?.message ?? data)}`);
  assert(data?.id && data.type === "IMAGE" && data.mimeType === "image/jpeg");
  fileIds.push(data.id);
  storageKeys.push(data.storageKey);
  return data;
}

async function createIdentity(label) {
  const email = `ggs-e2e-${randomUUID()}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const created = await request(supabaseUrl, "/auth/v1/admin/users", {
    method: "POST",
    key: adminKey,
    token: adminKey,
    body: { email, password, email_confirm: true, user_metadata: { name: `E2E ${label}` } },
  });
  assert.equal(created.status, 200, `Supabase could not create disposable user ${label}`);
  const identity = { authId: created.data.id };
  identities.push(identity);
  const login = await request(supabaseUrl, "/auth/v1/token?grant_type=password", {
    method: "POST",
    key: anonKey,
    body: { email, password },
  });
  assert.equal(login.status, 200, `Supabase login failed for ${label}`);
  identity.token = login.data.access_token;
  const me = await request(api, "/auth/me", { token: identity.token });
  assert.equal(me.status, 200, `API authentication failed for ${label}`);
  identity.userId = me.data.id;
  pass(`Supabase identity ${label} reaches the local API and PostgreSQL`);
  return identity;
}

function templateBody() {
  const element = {
    id: randomUUID(), type: "IMAGE", name: "Foto demostracion", key: "photo",
    page: 1, x: 56.7, y: 96, width: 226.8, height: 141.7, rotation: 0, zIndex: 1, required: true,
    properties: { fitMode: "contain", border: true, borderWidth: 1, borderRadius: 0, text: "", fontSize: 12, color: "#17211c", fill: "#eef2f4", stroke: "#63716a", strokeWidth: 1 },
  };
  return {
    name: "E2E DNI + Foto", description: "Fixture sintetico de validacion", paperSize: "A4", orientation: "PORTRAIT",
    width: 595.28, height: 841.89, marginTop: 28.35, marginRight: 28.35, marginBottom: 28.35, marginLeft: 28.35,
    pageCount: 1, elements: [element],
  };
}

// This 1x1 PNG fixture is generated in memory so the check never uses a personal document.
function demoPng() {
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
}

try {
  const health = await request(api, "/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.database, "connected");
  pass("API and PostgreSQL connected");

  const a = await createIdentity("A");
  const b = await createIdentity("B");
  const created = await request(api, "/templates", { token: a.token, method: "POST", body: templateBody() });
  if (created.data?.id) templateIds.push(created.data.id);
  assert.equal(created.status, 201);
  assert.equal(created.data.status, "ACTIVE");
  assert.equal(created.data.versions.length, 1);
  const version = created.data.versions[0];
  assert.equal(version.elements[0].key, "photo");
  assert.equal(Number(version.width), 595.28);
  pass("User A creates and persists an active A4 template through HTTP");

  const templateList = await request(api, "/templates?page=1&pageSize=1&search=E2E&status=ACTIVE&sortBy=name&sortOrder=asc", { token: a.token });
  assert.equal(templateList.status, 200);
  assert.equal(templateList.data.page, 1);
  assert.equal(templateList.data.pageSize, 1);
  assert.equal(templateList.data.items[0].id, created.data.id);
  assert.equal(templateList.data.total, 1);
  pass("Template list supports server-side search, status filtering, sorting and pagination");

  const renamed = await request(api, `/templates/${created.data.id}`, { token: a.token, method: "PATCH", body: { name: "E2E DNI + Foto Editada", description: "Metadata actualizada" } });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.name, "E2E DNI + Foto Editada");
  assert.equal(renamed.data.versions.length, 1);
  pass("Metadata can be updated without creating an unnecessary layout version");

  const versionInput = { paperSize: "A4", orientation: "PORTRAIT", width: 595.28, height: 841.89, marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, pageCount: 1, elements: [] };
  const secondVersion = await request(api, `/templates/${created.data.id}/versions`, { token: a.token, method: "POST", body: versionInput });
  assert.equal(secondVersion.status, 201);
  assert.equal(secondVersion.data.versionNumber, 2);
  assert.equal(secondVersion.data.isActive, false);
  const duplicatedVersion = await request(api, `/templates/${created.data.id}/versions/${version.id}/duplicate`, { token: a.token, method: "POST" });
  assert.equal(duplicatedVersion.status, 201);
  assert.equal(duplicatedVersion.data.versionNumber, 3);
  assert.equal(duplicatedVersion.data.elements.length, version.elements.length);
  const versions = await request(api, `/templates/${created.data.id}/versions`, { token: a.token });
  assert.equal(versions.status, 200);
  assert.equal(versions.data.length, 3);
  assert.equal((await request(api, `/templates/${created.data.id}/versions`, { token: b.token })).status, 404);
  pass("Version creation, duplication, numbering and cross-user protection work through HTTP");

  const ownTemplate = await request(api, `/templates/${created.data.id}`, { token: a.token });
  assert.equal(ownTemplate.status, 200);
  assert.equal((await request(api, `/templates/${created.data.id}`, { token: b.token })).status, 404);
  pass("Template ownership is enforced between users A and B");

  const image = await uploadImage(a.token, "foto-demo.png");
  assert.equal(image.width, 1);
  assert.equal(image.height, 1);
  assert.equal((await request(api, `/files/${image.id}/download`, { token: a.token })).status, 200);
  assert.equal((await request(api, `/files/${image.id}/download`, { token: b.token })).status, 404);
  pass("User A uploads and downloads a normalized private image; user B is denied");

  const requestKey = randomUUID();
  const generationBody = { templateVersionId: version.id, requestKey, inputs: [{ key: "photo", fileId: image.id }] };
  const generated = await request(api, "/generations", { token: a.token, method: "POST", body: generationBody });
  assert.equal(generated.status, 201);
  assert.equal(generated.data.status, "COMPLETED");
  assert(generated.data.outputFileId);
  generationIds.push(generated.data.id);
  const output = await prisma.storedFile.findUniqueOrThrow({ where: { id: generated.data.outputFileId } });
  fileIds.push(output.id);
  storageKeys.push(output.storageKey);
  pass("The API generates a completed PDF with a persisted output file");

  const downloaded = await fetch(`${api}/files/${output.id}/download`, { headers: { Authorization: `Bearer ${a.token}` }, signal: AbortSignal.timeout(30000) });
  const pdf = Buffer.from(await downloaded.arrayBuffer());
  assert.equal(downloaded.status, 200);
  assert(downloaded.headers.get("content-type")?.includes("application/pdf"));
  assert.equal(pdf.subarray(0, 4).toString("ascii"), "%PDF");
  assert(pdf.length > 1000);
  assert.equal((await request(api, `/files/${output.id}/signed-url`, { token: a.token })).status, 200);
  assert.equal((await request(api, `/files/${output.id}/download`, { token: b.token })).status, 404);
  assert.equal((await request(api, `/generations/${generated.data.id}`, { token: b.token })).status, 404);
  pass("The PDF is a real downloadable PDF, has a signed URL, and remains private");

  const activated = await request(api, `/templates/${created.data.id}/versions/${secondVersion.data.id}/activate`, { token: a.token, method: "POST" });
  assert.equal(activated.status, 200);
  assert.equal(activated.data.isActive, true);
  const archived = await request(api, `/templates/${created.data.id}/archive`, { token: a.token, method: "POST" });
  assert.equal(archived.status, 200);
  assert.equal(archived.data.status, "ARCHIVED");
  const restored = await request(api, `/templates/${created.data.id}/restore`, { token: a.token, method: "POST" });
  assert.equal(restored.status, 200);
  assert.equal(restored.data.status, "ACTIVE");
  pass("Version activation and template archive/restore preserve a valid state");

  const repeated = await request(api, "/generations", { token: a.token, method: "POST", body: generationBody });
  assert.equal(repeated.status, 201);
  assert.equal(repeated.data.id, generated.data.id);
  assert.equal(repeated.data.outputFileId, generated.data.outputFileId);
  pass("Repeated requestKey is idempotent and does not duplicate the document");

  const generations = await request(api, "/generations", { token: a.token });
  assert.equal(generations.status, 200);
  assert(generations.data.some((item) => item.id === generated.data.id && item.status === "COMPLETED"));
  console.log(`RESULT: ${checks} checks passed. Full template -> upload -> PDF -> download flow verified.`);
} catch (error) {
  // Provider responses and credentials are deliberately excluded from diagnostic output.
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
    console.log("CLEANUP: local demo identities, template, generation and file metadata removed");
  } catch {
    console.error("CLEANUP FAILED: local E2E fixtures require manual review");
    process.exitCode = 1;
  }
  if (storageKeys.length) {
    const removed = await adminStorage.storage.from(bucket).remove(storageKeys);
    if (removed.error) {
      console.error("CLEANUP FAILED: private storage objects require manual review");
      process.exitCode = 1;
    } else {
      console.log("CLEANUP: private storage objects removed");
    }
  }
  for (const identity of identities) {
    try {
      const deleted = await request(supabaseUrl, `/auth/v1/admin/users/${identity.authId}`, { method: "DELETE", key: adminKey, token: adminKey });
      assert.equal(deleted.status, 200);
    } catch {
      console.error("CLEANUP FAILED: disposable Supabase identity requires manual review");
      process.exitCode = 1;
    }
  }
  await prisma.$disconnect();
  await pool.end();
  if (!process.exitCode) console.log("CLEANUP: disposable Supabase identities removed");
}
