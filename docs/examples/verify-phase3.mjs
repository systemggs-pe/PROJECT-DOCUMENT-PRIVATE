/* global AbortSignal, console, fetch, process, URL */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Run from the repository root. Only disposable identities and fixtures are removed.
const api = process.env.DEMO_API_URL ?? "http://localhost:3000";
const databaseUrl = process.env.DATABASE_URL;
const supabase = process.env.SUPABASE_URL;
const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
assert(databaseUrl && supabase && adminKey && anonKey, "Missing configured environment variables");
assert(["localhost", "127.0.0.1"].includes(new URL(api).hostname), "Demo requires a local API");
assert(
  ["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname),
  "Demo requires local PostgreSQL",
);

const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
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
    signal: AbortSignal.timeout(15000),
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
  const email = `ggs-check-${randomUUID()}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const created = await request(supabase, "/auth/v1/admin/users", {
    method: "POST",
    key: adminKey,
    token: adminKey,
    body: { email, password, email_confirm: true, user_metadata: { name: `Demo ${label}` } },
  });
  assert.equal(created.status, 200, `Supabase could not create disposable user ${label}`);
  const identity = { authId: created.data.id };
  identities.push(identity);
  const login = await request(supabase, "/auth/v1/token?grant_type=password", {
    method: "POST",
    key: anonKey,
    body: { email, password },
  });
  assert.equal(login.status, 200, `Supabase login failed for ${label}`);
  identity.token = login.data.access_token;
  const me = await request(api, "/auth/me", { token: identity.token });
  assert.equal(me.status, 200, `API authentication failed for ${label}`);
  assert.equal(me.data.authProviderId, identity.authId);
  assert.equal(me.data.isActive, true);
  identity.userId = me.data.id;
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: identity.userId } })).authProviderId,
    identity.authId,
  );
  pass(`Supabase login -> API -> PostgreSQL identity ${label}`);
  return identity;
}

async function createTemplate(userId, label) {
  const id = randomUUID();
  templateIds.push(id);
  return prisma.template.create({
    data: {
      id,
      name: `DEMO DNI + Foto ${label}`,
      status: "ACTIVE",
      createdById: userId,
      description: "Synthetic acceptance fixture; not a generated PDF.",
      versions: {
        create: {
          versionNumber: 1,
          paperSize: "A4",
          orientation: "PORTRAIT",
          width: 595.28,
          height: 841.89,
          isActive: true,
          marginTop: 28.35,
          marginRight: 28.35,
          marginBottom: 28.35,
          marginLeft: 28.35,
          elements: {
            create: [
              {
                key: "dni_front",
                name: "DNI frontal",
                x: 56.7,
                y: 96,
                width: 226.8,
                height: 141.7,
              },
              {
                key: "dni_back",
                name: "DNI trasero",
                x: 311.8,
                y: 96,
                width: 226.8,
                height: 141.7,
              },
              { key: "photo", name: "Foto", x: 56.7, y: 278.4, width: 113.4, height: 141.7 },
            ].map((slot, index) => ({
              ...slot,
              type: "IMAGE",
              page: 1,
              required: true,
              zIndex: index + 1,
              properties: { fitMode: "contain", border: true, borderWidth: 1, borderRadius: 0 },
            })),
          },
        },
      },
    },
  });
}

try {
  const health = await request(api, "/health");
  assert.equal(health.status, 200);
  assert.equal(health.data.database, "connected");
  pass("API and PostgreSQL connected");
  for (const path of ["/auth/me", "/templates", "/files", "/generations"]) {
    assert.equal((await request(api, path)).status, 401);
    assert.equal((await request(api, path, { token: "invalid-demo-token" })).status, 401);
    pass(`${path}: no token and invalid token rejected (401)`);
  }
  const a = await createIdentity("A");
  const b = await createIdentity("B");
  const repeated = await request(api, "/auth/me", { token: a.token });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.id, a.userId);
  pass("Repeated identity synchronization returns the same local user");
  const templateA = await createTemplate(a.userId, "A");
  const templateB = await createTemplate(b.userId, "B");
  for (const [owner, own, foreign, label] of [
    [a, templateA, templateB, "A"],
    [b, templateB, templateA, "B"],
  ]) {
    const detail = await request(api, `/templates/${own.id}`, { token: owner.token });
    assert.equal(detail.status, 200);
    const version = detail.data.versions[0];
    assert.equal(version.paperSize, "A4");
    assert.equal(Number(version.width), 595.28);
    assert.equal(Number(version.height), 841.89);
    assert.deepEqual(version.elements.map((slot) => slot.key).sort(), [
      "dni_back",
      "dni_front",
      "photo",
    ]);
    assert(version.elements.every((slot) => slot.required && slot.type === "IMAGE"));
    pass(`User ${label}: reads their A4 template and its three required slots`);
    const list = await request(api, "/templates", { token: owner.token });
    assert.equal(list.status, 200);
    assert(list.data.some((item) => item.id === own.id));
    assert(list.data.every((item) => item.createdById === owner.userId));
    assert.equal(
      (await request(api, `/templates/${foreign.id}`, { token: owner.token })).status,
      404,
    );
    pass(`User ${label}: list ownership and cross-user direct access denied (404)`);
  }
  await prisma.user.update({ where: { id: a.userId }, data: { isActive: false } });
  assert.equal((await request(api, "/auth/me", { token: a.token })).status, 403);
  pass("Inactive local user rejected despite valid Supabase token (403)");
  console.log(
    `RESULT: ${checks} checks passed. PDF generation, uploads and editor are not tested by this example.`,
  );
} catch (error) {
  // Provider responses and credentials are deliberately excluded from diagnostic output.
  console.error(
    `FAIL: ${error instanceof assert.AssertionError ? error.message : "Request or database operation failed"}`,
  );
  process.exitCode = 1;
} finally {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.templateElement.deleteMany({
        where: { templateVersion: { templateId: { in: templateIds } } },
      });
      await tx.templateVersion.deleteMany({ where: { templateId: { in: templateIds } } });
      await tx.template.deleteMany({ where: { id: { in: templateIds } } });
      await tx.user.deleteMany({
        where: { authProviderId: { in: identities.map((item) => item.authId) } },
      });
    });
    console.log("CLEANUP: local demo fixtures removed");
  } catch {
    console.error(`CLEANUP FAILED: local fixtures for templates ${templateIds.join(", ")}`);
    process.exitCode = 1;
  }
  for (const identity of identities) {
    try {
      const deleted = await request(supabase, `/auth/v1/admin/users/${identity.authId}`, {
        method: "DELETE",
        key: adminKey,
        token: adminKey,
      });
      assert.equal(deleted.status, 200);
    } catch {
      console.error(`CLEANUP FAILED: disposable Supabase identity ${identity.authId}`);
      process.exitCode = 1;
    }
  }
  await prisma.$disconnect();
  await pool.end();
  if (!process.exitCode) console.log("CLEANUP: disposable Supabase identities removed");
}
