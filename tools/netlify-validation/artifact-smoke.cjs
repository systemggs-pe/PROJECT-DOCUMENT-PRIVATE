/* eslint-env node */
const assert = require("node:assert/strict");
const { realpathSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");

const root = realpathSync(process.argv[2]);
const apiRequire = createRequire(path.join(root, "apps/api/dist/serverless.js"));
function requireInside(requireFrom, name) {
  const resolved = realpathSync(requireFrom.resolve(name));
  assert.ok(resolved.startsWith(`${root}${path.sep}`), `${name} resolved outside extracted artifact`);
  return requireFrom(name);
}

(async () => {
  const sharp = requireInside(apiRequire, "sharp");
  const normalized = await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).png().toBuffer();
  assert.equal((await sharp(normalized).metadata()).format, "png");
  requireInside(apiRequire, "@prisma/client");
  requireInside(apiRequire, "@prisma/adapter-pg");
  const { DocumentConversionService } = apiRequire("./modules/document-conversion/document-conversion.service.js");
  const { ConfigService } = requireInside(apiRequire, "@nestjs/config");
  await assert.rejects(new DocumentConversionService(new ConfigService()).convertToPdf({ data: Buffer.from("word"), originalName: "historical.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), (error) => error.getStatus() === 400 && error.message.includes("Word"));
  const engine = requireInside(apiRequire, "@ggs/pdf-engine");
  const engineRequire = createRequire(apiRequire.resolve("@ggs/pdf-engine"));
  const PDFDocument = requireInside(engineRequire, "pdfkit");
  const document = new PDFDocument();
  const chunks = [];
  const finished = new Promise((resolve, reject) => {
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", resolve);
    document.on("error", reject);
  });
  document.text("Linux artifact: Helvetica and PDFKit resources");
  document.end();
  await finished;
  assert.equal(Buffer.concat(chunks).subarray(0, 5).toString(), "%PDF-");
  const rendered = await new engine.PdfKitEngine().render({ pageSize: "A4", orientation: "PORTRAIT", assets: [], pages: [{ pageNumber: 1, width: 595.28, height: 841.89, elements: [] }] });
  assert.equal(Buffer.from(rendered).subarray(0, 5).toString(), "%PDF-");
  const { handler } = require(path.join(root, "api.js"));
  const invoke = (route, headers = {}) => handler({ path: route, httpMethod: "GET", headers, body: null, isBase64Encoded: false }, {});
  const results = await Promise.all(Array.from({ length: 12 }, () => invoke("/api/health")));
  for (const response of results) {
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(response.body).database, "connected");
  }
  for (const route of ["/api/auth/me", "/api/files", "/api/generations"]) assert.equal((await invoke(route)).statusCode, 401);
  assert.equal((await invoke("/api/auth/me", { authorization: "Bearer invalid" })).statusCode, 401);
  const cors = await invoke("/api/health", { origin: "https://frontend.example.com" });
  assert.equal(cors.headers["access-control-allow-origin"], "https://frontend.example.com");
  console.log("PASS: extracted Linux ZIP loads its own Sharp, Prisma, PDFKit/fonts and PDF engine; concurrent health connects to isolated PostgreSQL; JWT protection and CORS survive packaging.");
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
