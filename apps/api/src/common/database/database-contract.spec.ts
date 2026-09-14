import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(process.cwd(), "../..");
const schema = readFileSync(path.join(workspaceRoot, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  path.join(
    workspaceRoot,
    "prisma/migrations/20260911201000_init_document_studio_schema/migration.sql",
  ),
  "utf8",
);
const seed = readFileSync(path.join(workspaceRoot, "prisma/seed.ts"), "utf8");

describe("database contract", () => {
  it("declares the MVP entities", () => {
    for (const model of [
      "User",
      "Template",
      "TemplateVersion",
      "TemplateElement",
      "StoredFile",
      "Generation",
      "GenerationInput",
      "AuditLog",
      "GenerationCounter",
    ]) {
      expect(schema).toContain(`model ${model}`);
    }
  });

  it("keeps version and image slot uniqueness constraints", () => {
    expect(schema).toContain("@@unique([templateId, versionNumber])");
    expect(schema).toContain("@@unique([templateVersionId, key])");
    expect(migration).toContain("template_versions_one_active_per_template_idx");
  });

  it("preserves history by restricting critical deletes", () => {
    expect(schema.match(/onDelete: Restrict/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
    expect(schema).toContain("onDelete: SetNull");
  });

  it("keeps generation numbers unique and backed by a counter table", () => {
    expect(schema).toContain("sequenceNumber    Int              @unique");
    expect(schema).toContain("number            String           @unique");
    expect(schema).toContain("model GenerationCounter");
    expect(migration).toContain("generation_counters_valid_values_chk");
  });

  it("keeps the seed idempotent", () => {
    expect(seed).toContain("prisma.user.upsert");
    expect(seed).toContain("prisma.template.upsert");
    expect(seed).toContain("prisma.templateVersion.upsert");
    expect(seed).toContain("skipDuplicates: true");
    expect(seed).toContain("prisma.generationCounter.upsert");
  });
});
