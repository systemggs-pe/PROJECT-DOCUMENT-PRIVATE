/* global AbortSignal, Blob, Buffer, console, fetch, FormData, process, URL */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const require = createRequire(import.meta.url);
const sharp = require("../../apps/api/node_modules/sharp");
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
const admin = createClient(supabaseUrl, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
const identities = [];
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
  return { status: response.status, data, text };
}

async function createIdentity(label) {
  const email = `ggs-phase6-${randomUUID()}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const created = await request(supabaseUrl, "/auth/v1/admin/users", {
    method: "POST",
    key: adminKey,
    token: adminKey,
    body: { email, password, email_confirm: true, user_metadata: { name: `Phase 6 ${label}` } },
  });
  assert.equal(created.status, 200, `Supabase could not create user ${label}`);
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
  assert.equal(me.status, 200, `API auth failed for ${label}`);
  identity.userId = me.data.id;
  pass(`Identity ${label} can access the local API`);
  return identity;
}

async function uploadImage(token, name, mimeType, buffer, expectedStatus = 201) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), name);
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
  assert.equal(response.status, expectedStatus, `Upload ${name} returned ${response.status}: ${JSON.stringify(data?.error?.message ?? data?.message ?? data)}`);
  if (expectedStatus === 201) {
    fileIds.push(data.id);
    storageKeys.push(data.storageKey);
  }
  return data;
}

async function image(format) {
  const builder = sharp({
    create: { width: 2, height: 2, channels: 3, background: format === "jpeg" ? "#f4f7f5" : "#2f7d5e" },
  });
  if (format === "jpeg") return builder.jpeg({ quality: 90 }).toBuffer();
  if (format === "webp") return builder.webp({ quality: 90 }).toBuffer();
  return builder.png().toBuffer();
}

async function storageExists(key) {
  const directory = key.slice(0, key.lastIndexOf("/"));
  const filename = key.slice(key.lastIndexOf("/") + 1);
  const { data, error } = await admin.storage.from(bucket).list(directory, { limit: 20, search: filename });
  if (error) return false;
  return data.some((item) => item.name === filename);
}

try {
  const health = await request(api, "/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.database, "connected");
  pass("API and PostgreSQL are ready");

  const a = await createIdentity("A");
  const b = await createIdentity("B");

  const jpeg = await uploadImage(a.token, "dni-frontal.jpg", "image/jpeg", await image("jpeg"));
  const bucketInfo = await admin.storage.getBucket(bucket);
  assert.equal(bucketInfo.error, null);
  assert.equal(bucketInfo.data.public, false);
  pass("Supabase Storage bucket exists and is private");

  assert.equal(jpeg.type, "IMAGE");
  assert.equal(jpeg.mimeType, "image/jpeg");
  assert.equal(jpeg.createdById, a.userId);
  assert.match(jpeg.storageKey, new RegExp(`^users/${a.userId}/files/${jpeg.id}/original\\.jpg$`));
  assert.equal(await storageExists(jpeg.storageKey), true);
  pass("JPEG upload stores normalized metadata and backend-owned path");

  const png = await uploadImage(a.token, "foto.png", "image/png", await image("png"));
  const webp = await uploadImage(a.token, "firma.webp", "image/webp", await image("webp"));
  assert.equal(png.mimeType, "image/jpeg");
  assert.equal(webp.mimeType, "image/jpeg");
  pass("PNG and WebP uploads are accepted and normalized");

  const listed = await request(api, "/files?page=1&pageSize=2&search=dni&type=IMAGE&sortBy=createdAt&sortOrder=desc", { token: a.token });
  assert.equal(listed.status, 200);
  assert.equal(listed.data.items.length, 1);
  assert.equal(listed.data.items[0].id, jpeg.id);
  assert.equal(listed.data.total, 1);
  const metadata = await request(api, `/files/${jpeg.id}`, { token: a.token });
  assert.equal(metadata.status, 200);
  assert.equal(metadata.data.id, jpeg.id);
  pass("File list and metadata are paginated, filtered and owner-scoped");

  const signed = await request(api, `/files/${jpeg.id}/signed-url`, { token: a.token });
  assert.equal(signed.status, 200);
  assert.equal(signed.data.expiresIn, 300);
  assert(!signed.data.url.includes(adminKey));
  const preview = await fetch(signed.data.url, { signal: AbortSignal.timeout(30000) });
  assert.equal(preview.status, 200);
  assert(preview.headers.get("content-type")?.includes("image/jpeg"));
  pass("Signed URL works for the owner and expires in five minutes");

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${jpeg.storageKey}`;
  const publicFetch = await fetch(publicUrl, { signal: AbortSignal.timeout(30000) });
  assert.notEqual(publicFetch.status, 200);
  pass("Direct public Storage URL does not expose the private object");

  assert.equal((await request(api, `/files/${jpeg.id}`, { token: b.token })).status, 404);
  assert.equal((await request(api, `/files/${jpeg.id}/signed-url`, { token: b.token })).status, 404);
  assert.equal((await request(api, `/files/${jpeg.id}`, { token: b.token, method: "DELETE" })).status, 404);
  pass("User B cannot read, sign or delete User A files");

  await uploadImage(a.token, "bad.svg", "image/svg+xml", Buffer.from("<svg></svg>"), 400);
  await uploadImage(a.token, "renamed.jpg", "image/jpeg", Buffer.from("MZ executable"), 400);
  await uploadImage(a.token, "large.jpg", "image/jpeg", Buffer.alloc(10 * 1024 * 1024 + 1), 413);
  pass("Unsupported, renamed and oversized files are rejected");

  const deleteResponse = await request(api, `/files/${webp.id}`, { token: a.token, method: "DELETE" });
  assert.equal(deleteResponse.status, 200);
  assert.equal(deleteResponse.data.deleted, true);
  assert.equal((await request(api, `/files/${webp.id}`, { token: a.token })).status, 404);
  assert.equal(await storageExists(webp.storageKey), false);
  fileIds.splice(fileIds.indexOf(webp.id), 1);
  storageKeys.splice(storageKeys.indexOf(webp.storageKey), 1);
  pass("Unused image delete removes metadata and Storage object");

  const audit = await prisma.auditLog.findMany({ where: { userId: a.userId, entityType: "STORED_FILE" } });
  assert(audit.some((item) => item.action === "CREATE"));
  assert(audit.some((item) => item.action === "DOWNLOAD"));
  assert(audit.some((item) => item.action === "DELETE"));
  pass("Upload, signed URL and delete are audited");

  console.log(`RESULT: ${checks} checks passed. Storage, metadata, signed URLs and ownership verified.`);
} catch (error) {
  console.error(`FAIL: ${error instanceof assert.AssertionError ? error.message : "Request, storage or database operation failed"}`);
  process.exitCode = 1;
} finally {
  for (const id of fileIds) {
    try {
      await prisma.generationInput.deleteMany({ where: { fileId: id } });
      await prisma.storedFile.deleteMany({ where: { id } });
    } catch {
      console.error("CLEANUP FAILED: local file metadata requires manual review");
      process.exitCode = 1;
    }
  }
  if (storageKeys.length) {
    const removed = await admin.storage.from(bucket).remove(storageKeys);
    if (removed.error) {
      console.error("CLEANUP FAILED: private storage objects require manual review");
      process.exitCode = 1;
    } else {
      console.log("CLEANUP: private storage objects removed");
    }
  }
  try {
    await prisma.auditLog.deleteMany({ where: { userId: { in: identities.map((item) => item.userId).filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { authProviderId: { in: identities.map((item) => item.authId) } } });
    console.log("CLEANUP: local phase 6 users and audit logs removed");
  } catch {
    console.error("CLEANUP FAILED: local users require manual review");
    process.exitCode = 1;
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
