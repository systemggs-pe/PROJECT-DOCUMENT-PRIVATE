import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const required = ["GGS_TEST_API_URL", "GGS_TEST_SUPABASE_URL", "GGS_TEST_TOKEN_A", "GGS_TEST_TOKEN_B"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length || process.env.GGS_ALLOW_TEST_WRITES !== "1") {
  console.error(`BLOCKED: configure ${missing.join(", ") || "the isolated test environment"} and GGS_ALLOW_TEST_WRITES=1. No requests sent.`);
  process.exit(2);
}

const api = new URL(process.env.GGS_TEST_API_URL);
assert.ok(api.protocol === "https:" || (["localhost", "127.0.0.1"].includes(api.hostname) && api.protocol === "http:"));
assert.ok(!api.search && !api.hash && !api.username && !api.password);
const base = api.href.replace(/\/$/, "");
const storageOrigin = new URL(process.env.GGS_TEST_SUPABASE_URL).origin;
const tokens = [process.env.GGS_TEST_TOKEN_A, process.env.GGS_TEST_TOKEN_B];
const claims = tokens.map((token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url")));
assert.notEqual(claims[0].sub, claims[1].sub, "Two different test users are required");
for (const claim of claims) assert.equal(claim.iss, `${storageOrigin}/auth/v1`, "Token issuer must match the dedicated test project");
const apiRequire = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const sharp = apiRequire("sharp");
const { PDFDocument } = apiRequire("pdf-lib");
const fixtures = { files: [], templates: [], generations: [] };

async function request(route, token, options = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(`${base}${route}`, { ...options, headers, redirect: "manual", signal: AbortSignal.timeout(60_000) });
}
async function json(route, token, method = "GET", body) {
  const response = await request(route, token, { method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}) });
  assert.ok(response.ok, `${method} ${route}: HTTP ${response.status}`);
  return response.json();
}
async function upload(content, name, mime, expected = 201) {
  const form = new FormData();
  form.set("file", new Blob([content], { type: mime }), name);
  const response = await request("/files", tokens[0], { method: "POST", body: form });
  assert.equal(response.status, expected, `Upload ${name}: HTTP ${response.status}`);
  if (expected === 201) { const file = await response.json(); fixtures.files.push(file.id); return file; }
}
async function download(route, token) {
  const signed = await json(`${route}/signed-url`, token);
  assert.equal(new URL(signed.url).origin, storageOrigin, "Signed URL must belong to test Storage");
  // Deliberately no Authorization header on the Storage request.
  const response = await fetch(signed.url, { signal: AbortSignal.timeout(60_000) });
  assert.equal(response.status, 200);
  return Buffer.from(await response.arrayBuffer());
}

try {
  assert.equal((await json("/health")).database, "connected");
  for (const token of [undefined, "invalid"]) assert.equal((await request("/auth/me", token)).status, 401);
  const users = await Promise.all(tokens.map((token) => json("/auth/me", token)));
  for (const user of users) assert.ok(user.roles.every((role) => !["ADMIN", "SUPERADMIN"].includes(role.key)), "Isolation requires ordinary test users");
  assert.notEqual(users[0].id, users[1].id);
  const images = [];
  for (const format of ["jpeg", "png", "webp"]) {
    const content = await sharp({ create: { width: 32, height: 32, channels: 3, background: "white" } }).toFormat(format).toBuffer();
    const file = await upload(content, `netlify-test.${format === "jpeg" ? "jpg" : format}`, `image/${format}`);
    images.push(file);
    assert.equal(file.type, "IMAGE");
    assert.equal((await sharp(await download(`/files/${file.id}`, tokens[0])).metadata()).format, "jpeg");
  }
  const attachment = await PDFDocument.create(); attachment.addPage([200, 200]);
  const pdf = await upload(await attachment.save(), "netlify-test.pdf", "application/pdf");
  assert.equal((await PDFDocument.load(await download(`/files/${pdf.id}`, tokens[0]))).getPageCount(), 1);
  await upload(Buffer.from("Word disabled"), "netlify-test.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 400);
  await upload(Buffer.alloc(3 * 1024 * 1024 + 1), "too-large.pdf", "application/pdf", 413);
  await upload(Buffer.from("not a PDF"), "invalid.pdf", "application/pdf", 400);
  const element = (type, key, y, properties) => ({ id: randomUUID(), type, name: type, key, page: 1, x: 30, y, width: 150, height: 60, rotation: 0, zIndex: y, required: type === "IMAGE", properties });
  const template = await json("/templates", tokens[0], "POST", { name: `Netlify isolated ${randomUUID()}`, description: "Disposable test fixture", paperSize: "A4", orientation: "PORTRAIT", width: 595.28, height: 841.89, marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, pageCount: 1, elements: [element("IMAGE", "photo", 30, { fitMode: "contain" }), element("TEXT", null, 120, { text: "Test {{customer}}", fontFamily: "Helvetica", fontSize: 12 })] });
  fixtures.templates.push(template.id);
  const body = { templateVersionId: template.versions[0].id, requestKey: randomUUID(), inputs: [{ key: "photo", fileId: images[0].id }], attachments: [{ fileId: pdf.id }], variables: { customer: "Netlify test" } };
  const preview = await request("/generations/preview", tokens[0], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(preview.status, 201);
  assert.equal((await PDFDocument.load(await preview.arrayBuffer())).getPageCount(), 2);
  const generation = await json("/generations", tokens[0], "POST", body);
  fixtures.generations.push(generation.id);
  assert.equal(generation.status, "COMPLETED");
  assert.match(generation.number, /^GGS-\d+$/);
  assert.equal((await json("/generations", tokens[0], "POST", body)).id, generation.id);
  assert.equal((await PDFDocument.load(await download(`/generations/${generation.id}`, tokens[0]))).getPageCount(), 2);
  const redirect = await request(`/generations/${generation.id}/download`, tokens[0]);
  assert.equal(redirect.status, 302);
  assert.equal(new URL(redirect.headers.get("location")).origin, storageOrigin);
  for (const route of [`/files/${images[0].id}`, `/files/${images[0].id}/signed-url`, `/files/${images[0].id}/download`, `/templates/${template.id}`, `/generations/${generation.id}`, `/generations/${generation.id}/signed-url`, `/generations/${generation.id}/download`]) {
    assert.ok([403, 404].includes((await request(route, tokens[1])).status), `Cross-user access must be denied: ${route}`);
  }
  for (const route of [`/files/${images[0].id}`, `/generations/${generation.id}`]) assert.ok([403, 404].includes((await request(route, tokens[1], { method: "DELETE" })).status));
  console.log("PASS: Supabase JWT, images/PDF, preview, generation, idempotence, signed downloads and cross-user permissions against the explicitly configured test environment.");
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  // Keep fixtures for review; never drop a database or remove historical data.
  console.log("Test fixture IDs (retained in the isolated test environment):", JSON.stringify(fixtures));
}
