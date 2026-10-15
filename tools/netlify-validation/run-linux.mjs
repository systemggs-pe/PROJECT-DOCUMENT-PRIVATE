import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

assert.equal(process.platform, "linux", "This validation must run on Linux");
assert.equal(process.versions.node.split(".")[0], "24");
assert.equal(process.env.GGS_ISOLATED_VALIDATION, "1");
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.hostname, "postgres");
assert.equal(database.pathname, "/ggs_netlify_validation");

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit", env: process.env });
}
assert.equal(execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim(), "11.19.0");
console.log(`Linux validation: Node ${process.version}, ${process.arch}, pnpm 11.19.0`);
run("pnpm", ["db:generate"]);
// This URL is fixed to the isolated Compose service above, never inherited from the host.
const readOnlyDatabase = process.argv.includes("--read-only-database");
if (readOnlyDatabase) {
  database.searchParams.set("options", "-c default_transaction_read_only=on");
  process.env.DATABASE_URL = database.href;
  process.env.GGS_READ_ONLY_VALIDATION = "1";
}
if (!readOnlyDatabase) {
  run("pnpm", ["exec", "prisma", "migrate", "deploy"]);
  run("pnpm", ["db:seed"]);
}
run("pnpm", ["typecheck"]);
run("pnpm", ["lint"]);
run("pnpm", ["test"]);
if (!readOnlyDatabase) run("pnpm", ["test:integration"]);
else console.log("SKIP: migrations, seed and the eight fixture-writing integration tests (read-only database validation).");
run("pnpm", ["--filter", "@ggs/api", "exec", "vitest", "run", "src/common/database/prisma-pool.integration.spec.ts"]);
run("pnpm", ["bundle:netlify"]);
const resolvedConfig = readFileSync("apps/api/.netlify/netlify.toml", "utf8");
assert.ok(resolvedConfig.includes('/workspace/netlify/functions'));
assert.ok(resolvedConfig.includes('/workspace/netlify/public'));
assert.equal(existsSync("apps/web/dist/index.html"), false, "Backend validation unexpectedly built the frontend");

const manifest = JSON.parse(readFileSync("apps/api/.netlify/functions/manifest.json", "utf8"));
const api = manifest.functions.find((entry) => entry.name === "api");
assert.ok(api, "API function missing from manifest");
assert.equal(api.bundler, "nft");
assert.equal(api.runtimeVersion, "nodejs24.x");
const extracted = mkdtempSync(path.join(tmpdir(), "ggs-netlify-artifact-"));
run("unzip", ["-q", api.path, "-d", extracted]);
run(process.execPath, ["--no-experimental-require-module", "tools/netlify-validation/artifact-smoke.cjs", extracted]);
console.log(`PASS: Linux install, build, unit tests, ${readOnlyDatabase ? "read-only PostgreSQL and pool concurrency" : "database integration and pool concurrency"}, isolated artifact smoke with require(ESM) disabled.`);
