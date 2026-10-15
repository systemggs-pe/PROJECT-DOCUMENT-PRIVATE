/* eslint-env node */
const assert = require("node:assert/strict");
const { readFileSync, realpathSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createServer } = require("node:http");
const { once } = require("node:events");

const root = realpathSync(process.argv[2]);
const apiRequire = createRequire(path.join(root, "apps/api/dist/serverless.js"));
function requireInside(requireFrom, name) {
  const resolved = realpathSync(requireFrom.resolve(name));
  assert.ok(resolved.startsWith(`${root}${path.sep}`), `${name} resolved outside extracted artifact`);
  return requireFrom(name);
}

(async () => {
  assert.ok(process.execArgv.includes("--no-experimental-require-module"), "Lambda-like ESM compatibility flag is required");
  const verifierSource = readFileSync(path.join(root, "apps/api/dist/modules/auth/services/supabase-jwt-verifier.service.js"), "utf8");
  assert.match(verifierSource, /import\(["']jose["']\)/, "Compiled verifier must retain native import(jose)");
  assert.doesNotMatch(verifierSource, /require\(["']jose["']\)/);
  assert.match(verifierSource, /exports\.SupabaseJwtVerifierService/);
  const josePath = realpathSync(apiRequire.resolve("jose"));
  assert.ok(josePath.startsWith(`${root}${path.sep}`), "jose must be inside the extracted artifact");
  const jose = await import(pathToFileURL(josePath).href);
  const sharp = requireInside(apiRequire, "sharp");
  const normalized = await sharp({ create: { width: 8, height: 8, channels: 3, background: "white" } }).png().toBuffer();
  assert.equal((await sharp(normalized).metadata()).format, "png");
  const { PrismaClient } = requireInside(apiRequire, "@prisma/client");
  const { PrismaPg } = requireInside(apiRequire, "@prisma/adapter-pg");
  const { Pool } = requireInside(apiRequire, "pg");
  if (process.env.GGS_READ_ONLY_VALIDATION === "1") {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const client = new PrismaClient({ adapter: new PrismaPg(pool) });
    try {
      const rows = await client.$queryRaw`SELECT current_setting('transaction_read_only') AS mode`;
      assert.equal(rows[0].mode, "on", "PostgreSQL connections must enforce read-only transactions");
    } finally {
      await client.$disconnect();
      await pool.end();
    }
  }
  const { DocumentConversionService } = apiRequire("./modules/document-conversion/document-conversion.service.js");
  const { ConfigService } = requireInside(apiRequire, "@nestjs/config");
  const { SupabaseJwtVerifierService } = apiRequire("./modules/auth/services/supabase-jwt-verifier.service.js");
  const testSecret = "artifact-only-test-secret-with-enough-length";
  const verifier = new SupabaseJwtVerifierService(new ConfigService({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_JWT_SECRET: testSecret, SUPABASE_JWT_AUDIENCE: "authenticated" }));
  const token = await new jose.SignJWT({ email: "artifact@example.com" })
    .setProtectedHeader({ alg: "HS256" }).setSubject("4eb77b04-1389-48df-8d3c-e7de38e63f7c")
    .setIssuer("https://example.supabase.co/auth/v1").setAudience("authenticated").setExpirationTime("5m")
    .sign(new TextEncoder().encode(testSecret));
  assert.equal((await verifier.verify(token)).email, "artifact@example.com");
  await assert.rejects(verifier.verify("invalid"), (error) => error.getStatus() === 401);
  const { publicKey, privateKey } = await jose.generateKeyPair("RS256");
  const jwk = { ...await jose.exportJWK(publicKey), kid: "artifact-jwks", alg: "RS256", use: "sig" };
  let jwksRequests = 0;
  const jwksServer = createServer((_request, response) => {
    jwksRequests += 1;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  jwksServer.listen(0, "127.0.0.1");
  await once(jwksServer, "listening");
  try {
    const jwksVerifier = new SupabaseJwtVerifierService(new ConfigService({ SUPABASE_URL: "https://example.supabase.co", SUPABASE_JWT_SECRET: "", SUPABASE_JWKS_URL: `http://127.0.0.1:${jwksServer.address().port}/jwks`, SUPABASE_JWT_AUDIENCE: "authenticated" }));
    const asymmetricToken = await new jose.SignJWT({ email: "jwks-artifact@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "artifact-jwks" }).setSubject("4eb77b04-1389-48df-8d3c-e7de38e63f7c")
      .setIssuer("https://example.supabase.co/auth/v1").setAudience("authenticated").setExpirationTime("5m").sign(privateKey);
    const identities = await Promise.all(Array.from({ length: 8 }, () => jwksVerifier.verify(asymmetricToken)));
    for (const identity of identities) assert.equal(identity.email, "jwks-artifact@example.com");
    assert.equal(jwksRequests, 1, "Concurrent validations must reuse the JWKS resolver/cache");
  } finally {
    await new Promise((resolve, reject) => jwksServer.close((error) => error ? reject(error) : resolve()));
  }
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
