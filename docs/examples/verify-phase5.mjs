/* global AbortSignal, console, fetch, process, URL */
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
assert(databaseUrl && supabaseUrl && adminKey && anonKey, "Missing configured environment variables");
assert(["localhost", "127.0.0.1"].includes(new URL(api).hostname), "Demo requires a local API");
assert(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "Demo requires local PostgreSQL");

const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
createClient(supabaseUrl, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
const identities = [];
const templateIds = [];
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

async function createIdentity(label) {
  const email = `ggs-phase5-${randomUUID()}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const created = await request(supabaseUrl, "/auth/v1/admin/users", {
    method: "POST",
    key: adminKey,
    token: adminKey,
    body: { email, password, email_confirm: true, user_metadata: { name: `Phase 5 ${label}` } },
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
  pass(`Identity ${label} can access the editor API`);
  return identity;
}

function elements() {
  return [
    {
      id: randomUUID(), type: "IMAGE", name: "DNI frontal", key: "dni_front",
      page: 1, x: 56.7, y: 96, width: 226.8, height: 141.7, rotation: 0, zIndex: 1, required: true,
      properties: props({ fitMode: "contain", border: true, text: "" }),
    },
    {
      id: randomUUID(), type: "TEXT", name: "Cliente", key: null,
      page: 1, x: 56.7, y: 260, width: 220, height: 36, rotation: 0, zIndex: 2, required: false,
      properties: props({ text: "{{cliente_nombre}}", fontSize: 14, fontWeight: "600" }),
    },
    {
      id: randomUUID(), type: "RECTANGLE", name: "Marco", key: null,
      page: 1, x: 40, y: 80, width: 520, height: 240, rotation: 0, zIndex: 0, required: false,
      properties: props({ fill: "#eef2f4", stroke: "#63716a", strokeWidth: 1, borderRadius: 6 }),
    },
    {
      id: randomUUID(), type: "LINE", name: "Separador", key: null,
      page: 1, x: 40, y: 340, width: 520, height: 2, rotation: 0, zIndex: 3, required: false,
      properties: props({ strokeWidth: 2 }),
    },
  ];
}

function props(overrides = {}) {
  return {
    fitMode: "contain", border: true, borderWidth: 1, borderRadius: 0,
    text: "", fontSize: 12, fontFamily: "Inter", fontWeight: "400", textAlign: "left",
    color: "#17211c", fill: "#eef2f4", stroke: "#63716a", strokeWidth: 1,
    ...overrides,
  };
}

function versionBody(items = elements()) {
  return {
    paperSize: "A4", orientation: "PORTRAIT", width: 595.28, height: 841.89,
    marginTop: 28.35, marginRight: 28.35, marginBottom: 28.35, marginLeft: 28.35,
    pageCount: 1, elements: items,
  };
}

try {
  const health = await request(api, "/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.database, "connected");
  pass("API and PostgreSQL are ready");

  const a = await createIdentity("A");
  const b = await createIdentity("B");
  const created = await request(api, "/templates", { token: a.token, method: "POST", body: { name: "Phase 5 Editor", description: "Disposable visual editor check" } });
  assert.equal(created.status, 201);
  templateIds.push(created.data.id);
  const version = created.data.versions[0];
  pass("User A creates a disposable template with version 1");

  const saved = await request(api, `/templates/${created.data.id}/versions/${version.id}`, { token: a.token, method: "PUT", body: versionBody() });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.id, version.id);
  assert.equal(saved.data.elements.length, 4);
  assert.equal(saved.data.elements.find((item) => item.type === "IMAGE").key, "dni_front");
  assert.equal(saved.data.elements.find((item) => item.type === "TEXT").properties.text, "{{cliente_nombre}}");
  pass("A version saves IMAGE, TEXT, RECTANGLE and LINE elements transactionally");

  const reloaded = await request(api, `/templates/${created.data.id}/versions/${version.id}`, { token: a.token });
  assert.equal(reloaded.status, 200);
  assert.equal(Number(reloaded.data.elements.find((item) => item.key === "dni_front").x), 56.7);
  assert.equal(Number(reloaded.data.width), 595.28);
  pass("Saved coordinates survive reload in document points");

  const invalid = await request(api, `/templates/${created.data.id}/versions/${version.id}`, {
    token: a.token,
    method: "PUT",
    body: versionBody([{ ...elements()[0], x: -10 }]),
  });
  assert.equal(invalid.status, 400);
  const afterInvalid = await request(api, `/templates/${created.data.id}/versions/${version.id}`, { token: a.token });
  assert.equal(afterInvalid.data.elements.length, 4);
  pass("Invalid geometry is rejected without losing persisted elements");

  const foreignUpdate = await request(api, `/templates/${created.data.id}/versions/${version.id}`, { token: b.token, method: "PUT", body: versionBody() });
  assert.equal(foreignUpdate.status, 404);
  const foreignRead = await request(api, `/templates/${created.data.id}/versions/${version.id}`, { token: b.token });
  assert.equal(foreignRead.status, 404);
  pass("Ownership protects version reads and writes");

  const duplicated = await request(api, `/templates/${created.data.id}/versions/${version.id}/duplicate`, { token: a.token, method: "POST" });
  assert.equal(duplicated.status, 201);
  assert.equal(duplicated.data.elements.length, 4);
  assert.equal(duplicated.data.isActive, false);
  pass("Duplicating a version preserves editor elements");

  const list = await request(api, `/templates/${created.data.id}/versions`, { token: a.token });
  assert.equal(list.status, 200);
  assert.equal(list.data.length, 2);
  pass("The version list exposes the edited and duplicated versions");

  const persisted = await prisma.templateElement.findMany({ where: { templateVersionId: version.id } });
  assert.equal(persisted.length, 4);
  assert(persisted.every((item) => item.templateVersionId === version.id));
  pass("PostgreSQL stores elements under the correct TemplateVersion");

  console.log(`RESULT: ${checks} checks passed. Visual editor persistence and ownership verified.`);
} catch (error) {
  console.error(`FAIL: ${error instanceof assert.AssertionError ? error.message : "Request or database operation failed"}`);
  process.exitCode = 1;
} finally {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.deleteMany({ where: { userId: { in: identities.map((item) => item.userId).filter(Boolean) } } });
      await tx.templateElement.deleteMany({ where: { templateVersion: { templateId: { in: templateIds } } } });
      await tx.templateVersion.deleteMany({ where: { templateId: { in: templateIds } } });
      await tx.template.deleteMany({ where: { id: { in: templateIds } } });
      await tx.user.deleteMany({ where: { authProviderId: { in: identities.map((item) => item.authId) } } });
    });
    console.log("CLEANUP: local phase 5 template and users removed");
  } catch {
    console.error("CLEANUP FAILED: local phase 5 fixtures require manual review");
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
