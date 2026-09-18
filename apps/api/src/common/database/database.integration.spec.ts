import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { GenerationNumberService } from "./generation-number.service";
import type { CurrentUser } from "../../modules/auth/types/current-user";
import { FilesService } from "../../modules/files/files.service";
import { GenerationsService } from "../../modules/generations/generations.service";
import { TemplatesService } from "../../modules/templates/templates.service";
import { TemplateVersionsService } from "../../modules/template-versions/template-versions.service";
import type { PrismaService } from "./prisma.service";

const databaseUrl =
  process.env["DATABASE_URL"] ??
  "postgresql://ggs:desarrollo-local@localhost:5432/ggs_document_studio?schema=public";
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const generationNumberService = new GenerationNumberService({
  client: prisma,
} as PrismaService);
const prismaService = { client: prisma } as PrismaService;
const templatesService = new TemplatesService(prismaService);
const templateVersionsService = new TemplateVersionsService(prismaService);
const generationsService = new GenerationsService(prismaService);
const filesService = new FilesService(prismaService);

afterAll(async () => {
  await prisma.$disconnect();
  await pool.end();
});

describe("database integration", () => {
  it("contains the idempotent seed data and image slots", async () => {
    const template = await prisma.template.findFirstOrThrow({
      where: {
        name: "DNI + Foto",
      },
      include: {
        versions: {
          include: {
            elements: {
              orderBy: {
                key: "asc",
              },
            },
          },
        },
      },
    });

    expect(template.status).toBe("ACTIVE");
    const seedVersion = template.versions.find((version) => version.versionNumber === 1);
    expect(seedVersion?.isActive).toBe(true);

    const slots = seedVersion?.elements ?? [];
    expect(slots.map((slot) => slot.key)).toEqual(["dni_back", "dni_front", "photo"]);
    expect(slots.every((slot) => slot.type === "IMAGE")).toBe(true);
    expect(slots.every((slot) => slot.required)).toBe(true);
    expect(slots[0]?.properties).toMatchObject({
      fitMode: "contain",
      border: true,
      borderWidth: 1,
      borderRadius: 0,
    });
  });

  it("allows multiple versions and rejects duplicate or double-active versions", async () => {
    const context = await createTemplateContext("versioning");

    const versionOne = await prisma.templateVersion.create({
      data: {
        templateId: context.templateId,
        versionNumber: 1,
        paperSize: "A4",
        orientation: "PORTRAIT",
        width: 595.28,
        height: 841.89,
        isActive: true,
      },
    });
    const versionTwo = await prisma.templateVersion.create({
      data: {
        templateId: context.templateId,
        versionNumber: 2,
        paperSize: "A4",
        orientation: "PORTRAIT",
        width: 595.28,
        height: 841.89,
        isActive: false,
      },
    });

    await expect(
      prisma.templateVersion.create({
        data: {
          templateId: context.templateId,
          versionNumber: 1,
          paperSize: "A4",
          orientation: "PORTRAIT",
          width: 595.28,
          height: 841.89,
        },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.templateVersion.create({
        data: {
          templateId: context.templateId,
          versionNumber: 3,
          paperSize: "A4",
          orientation: "PORTRAIT",
          width: 595.28,
          height: 841.89,
          isActive: true,
        },
      }),
    ).rejects.toThrow();

    await cleanupTemplateContext({
      ...context,
      versionIds: [versionOne.id, versionTwo.id],
    });
  });

  it("rejects duplicate image slot keys inside one template version", async () => {
    const context = await createTemplateContext("image-slots");
    const version = await prisma.templateVersion.create({
      data: {
        templateId: context.templateId,
        versionNumber: 1,
        paperSize: "A4",
        orientation: "PORTRAIT",
        width: 595.28,
        height: 841.89,
        isActive: true,
      },
    });

    await prisma.templateElement.create({
      data: imageSlot(version.id, "dni_front", "DNI frontal"),
    });

    await expect(
      prisma.templateElement.create({
        data: imageSlot(version.id, "dni_front", "DNI frontal duplicado"),
      }),
    ).rejects.toThrow();

    await prisma.templateElement.deleteMany({ where: { templateVersionId: version.id } });
    await cleanupTemplateContext({
      ...context,
      versionIds: [version.id],
    });
  });

  it("creates, duplicates, lists, and activates owned versions", async () => {
    const context = await createTemplateContext("version-service");
    const first = await createVersion(context.templateId);
    const second = await templateVersionsService.create(context.templateId, context.user, {
      paperSize: "A4", orientation: "PORTRAIT", width: 595.28, height: 841.89,
      marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, pageCount: 1, elements: [],
    });
    const duplicate = await templateVersionsService.duplicate(context.templateId, first.id, context.user);

    expect(second.versionNumber).toBe(2);
    expect(duplicate.versionNumber).toBe(3);
    expect(duplicate.elements).toHaveLength(0);
    await expect(templateVersionsService.findOwned(context.templateId, second.id, actor("foreign-user"))).rejects.toThrow();
    await templateVersionsService.activate(context.templateId, second.id, context.user);
    const versions = await templateVersionsService.listOwned(context.templateId, context.user);
    expect(versions.filter((version) => version.isActive)).toHaveLength(1);
    expect(versions.find((version) => version.id === second.id)?.isActive).toBe(true);

    await cleanupTemplateContext({ ...context, versionIds: [first.id, second.id, duplicate.id] });
  });

  it("updates a specific owned version transactionally and validates editor elements", async () => {
    const context = await createTemplateContext("editor-version");
    const version = await createVersion(context.templateId);
    const elements = editorElements();

    const updated = await templateVersionsService.update(context.templateId, version.id, context.user, {
      paperSize: "A4", orientation: "PORTRAIT", width: 595.28, height: 841.89,
      marginTop: 28.35, marginRight: 28.35, marginBottom: 28.35, marginLeft: 28.35,
      pageCount: 1, elements,
    });

    expect(updated.id).toBe(version.id);
    expect(updated.elements).toHaveLength(4);
    expect(updated.elements.map((element) => element.type).sort()).toEqual(["IMAGE", "LINE", "RECTANGLE", "TEXT"]);
    expect(updated.elements.find((element) => element.type === "IMAGE")).toMatchObject({ key: "dni_front", required: true });

    await expect(templateVersionsService.update(context.templateId, version.id, context.user, {
      paperSize: "A4", orientation: "PORTRAIT", width: 595.28, height: 841.89,
      marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, pageCount: 1,
      elements: elements.map((element) => ({ ...element, key: element.type === "IMAGE" ? "dni_front" : "bad_key" })),
    })).rejects.toThrow();
    await expect(templateVersionsService.update(context.templateId, version.id, actor("foreign-user"), {
      paperSize: "A4", orientation: "PORTRAIT", width: 595.28, height: 841.89,
      marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, pageCount: 1, elements,
    })).rejects.toThrow();

    const afterRejectedUpdate = await templateVersionsService.findOwned(context.templateId, version.id, context.user);
    expect(afterRejectedUpdate.elements).toHaveLength(4);

    const file = await createStoredFile(context.userId, "editor-version");
    const allocated = await generationNumberService.next(`editor-version-${randomUUID()}`);
    const generation = await createGeneration({ userId: context.userId, templateId: context.templateId, versionId: version.id, fileId: file.id, allocated });
    await expect(templateVersionsService.update(context.templateId, version.id, context.user, {
      paperSize: "A4", orientation: "PORTRAIT", width: 595.28, height: 841.89,
      marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, pageCount: 1, elements: [],
    })).rejects.toThrow("Duplicala");

    await prisma.generation.delete({ where: { id: generation.id } });
    await prisma.storedFile.delete({ where: { id: file.id } });
    await cleanupTemplateContext({ ...context, versionIds: [version.id] });
  });

  it("allocates unique concurrent generation numbers through PostgreSQL", async () => {
    const counterKey = `integration-${randomUUID()}`;
    const count = 50;
    const numbers = await Promise.all(
      Array.from({ length: count }, () => generationNumberService.next(counterKey)),
    );

    const uniqueNumbers = new Set(numbers.map((item) => item.number));
    const sequenceNumbers = numbers.map((item) => item.sequenceNumber).sort((a, b) => a - b);

    expect(uniqueNumbers.size).toBe(count);
    expect(sequenceNumbers).toEqual(Array.from({ length: count }, (_, index) => index + 1));
    expect(numbers.every((item) => /^GGS-\d{6}$/.test(item.number))).toBe(true);

    await prisma.generationCounter.delete({ where: { key: counterKey } });
  });

  it("preserves historical relationships through restrictive deletes", async () => {
    const context = await createTemplateContext("history");
    const version = await prisma.templateVersion.create({
      data: {
        templateId: context.templateId,
        versionNumber: 1,
        paperSize: "A4",
        orientation: "PORTRAIT",
        width: 595.28,
        height: 841.89,
        isActive: true,
      },
    });
    const element = await prisma.templateElement.create({
      data: imageSlot(version.id, "photo", "Foto"),
    });
    const file = await prisma.storedFile.create({
      data: {
        originalName: "photo.png",
        storageKey: `integration/${randomUUID()}/photo.png`,
        bucket: "uploads",
        type: "IMAGE",
        mimeType: "image/png",
        sizeBytes: 128n,
        createdById: context.userId,
      },
    });
    const allocated = await generationNumberService.next(`history-${randomUUID()}`);
    const generation = await prisma.generation.create({
      data: {
        sequenceNumber: allocated.sequenceNumber,
        number: allocated.number,
        templateId: context.templateId,
        templateVersionId: version.id,
        createdById: context.userId,
        outputFileId: file.id,
        status: "COMPLETED",
      },
    });
    const input = await prisma.generationInput.create({
      data: {
        generationId: generation.id,
        templateElementId: element.id,
        key: "photo",
        fileId: file.id,
      },
    });

    const loadedGeneration = await prisma.generation.findUniqueOrThrow({
      where: { id: generation.id },
      include: {
        template: true,
        templateVersion: true,
        inputs: true,
      },
    });

    expect(loadedGeneration.template.id).toBe(context.templateId);
    expect(loadedGeneration.templateVersion.id).toBe(version.id);
    expect(loadedGeneration.inputs).toHaveLength(1);

    await expect(prisma.template.delete({ where: { id: context.templateId } })).rejects.toThrow();
    await expect(prisma.templateVersion.delete({ where: { id: version.id } })).rejects.toThrow();
    await expect(prisma.user.delete({ where: { id: context.userId } })).rejects.toThrow();
    await expect(prisma.storedFile.delete({ where: { id: file.id } })).rejects.toThrow();

    await prisma.generationInput.delete({ where: { id: input.id } });
    await prisma.generation.delete({ where: { id: generation.id } });
    await prisma.storedFile.delete({ where: { id: file.id } });
    await prisma.templateElement.delete({ where: { id: element.id } });
    await cleanupTemplateContext({
      ...context,
      versionIds: [version.id],
    });
  });

  it("isolates templates, generations, and stored files between User A and User B", async () => {
    const counterKey = `isolation-${randomUUID()}`;
    const userA = await createTemplateContext("isolation-a");
    const userB = await createTemplateContext("isolation-b");
    const versionA = await createVersion(userA.templateId);
    const versionB = await createVersion(userB.templateId);
    const fileA = await createStoredFile(userA.userId, "a");
    const fileB = await createStoredFile(userB.userId, "b");
    const allocatedA = await generationNumberService.next(counterKey);
    const allocatedB = await generationNumberService.next(counterKey);
    const generationA = await createGeneration({
      userId: userA.userId,
      templateId: userA.templateId,
      versionId: versionA.id,
      fileId: fileA.id,
      allocated: allocatedA,
    });
    const generationB = await createGeneration({
      userId: userB.userId,
      templateId: userB.templateId,
      versionId: versionB.id,
      fileId: fileB.id,
      allocated: allocatedB,
    });

    await expect(templatesService.findOwnedOrThrow(userA.templateId, userA.user)).resolves.toMatchObject({
      id: userA.templateId,
    });
    await expect(templatesService.findOwnedOrThrow(userB.templateId, userA.user)).rejects.toThrow();
    await expect(templatesService.findOwnedOrThrow(userB.templateId, userB.user)).resolves.toMatchObject({
      id: userB.templateId,
    });
    await expect(templatesService.findOwnedOrThrow(userA.templateId, userB.user)).rejects.toThrow();

    await expect(generationsService.findOwnedOrThrow(generationA.id, userA.user)).resolves.toMatchObject({
      id: generationA.id,
    });
    await expect(generationsService.findOwnedOrThrow(generationB.id, userA.user)).rejects.toThrow();
    await expect(generationsService.findOwnedOrThrow(generationB.id, userB.user)).resolves.toMatchObject({
      id: generationB.id,
    });
    await expect(generationsService.findOwnedOrThrow(generationA.id, userB.user)).rejects.toThrow();

    await expect(filesService.findOwnedOrThrow(fileA.id, userA.user)).resolves.toMatchObject({
      id: fileA.id,
      sizeBytes: "128",
    });
    await expect(filesService.findOwnedOrThrow(fileB.id, userA.user)).rejects.toThrow();
    await expect(filesService.findOwnedOrThrow(fileB.id, userB.user)).resolves.toMatchObject({
      id: fileB.id,
      sizeBytes: "128",
    });
    await expect(filesService.findOwnedOrThrow(fileA.id, userB.user)).rejects.toThrow();

    await prisma.generation.deleteMany({ where: { id: { in: [generationA.id, generationB.id] } } });
    await prisma.storedFile.deleteMany({ where: { id: { in: [fileA.id, fileB.id] } } });
    await cleanupTemplateContext({ ...userA, versionIds: [versionA.id] });
    await cleanupTemplateContext({ ...userB, versionIds: [versionB.id] });
    await prisma.generationCounter.delete({ where: { key: counterKey } });
  }, 15000);
});

async function createTemplateContext(label: string) {
  const id = randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `${label}-${id}@integration.local`,
      authProviderId: `${label}-${id}`,
      name: `Integration ${label}`,
    },
  });
  const template = await prisma.template.create({
    data: {
      name: `Integration ${label} ${id}`,
      createdById: user.id,
    },
  });

  return {
    userId: user.id,
    user: actor(user.id),
    templateId: template.id,
  };
}

async function cleanupTemplateContext(context: { userId: string; templateId: string; versionIds: string[] }) {
  await prisma.templateElement.deleteMany({
    where: {
      templateVersionId: {
        in: context.versionIds,
      },
    },
  });
  await prisma.templateVersion.deleteMany({
    where: {
      id: {
        in: context.versionIds,
      },
    },
  });
  await prisma.template.delete({ where: { id: context.templateId } });
  await prisma.user.delete({ where: { id: context.userId } });
}

function actor(userId: string): CurrentUser {
  const roles = [{ id: "USER", key: "USER", name: "Usuario", isSystem: true }];
  return {
    id: userId,
    authProviderId: userId,
    email: `${userId}@integration.local`,
    name: "Integration user",
    avatarUrl: null,
    isActive: true,
    status: "ACTIVE",
    roles,
    permissions: [],
    authorization: { roles, permissions: [] },
  };
}

function imageSlot(templateVersionId: string, key: string, name: string) {
  return {
    templateVersionId,
    type: "IMAGE" as const,
    key,
    name,
    page: 1,
    x: 10,
    y: 20,
    width: 100,
    height: 80,
    rotation: 0,
    zIndex: 1,
    required: true,
    properties: {
      fitMode: "contain",
      border: true,
      borderWidth: 1,
      borderRadius: 0,
    },
  };
}

function editorElements() {
  return [
    {
      id: randomUUID(), type: "IMAGE" as const, name: "DNI frontal", key: "dni_front",
      page: 1, x: 56.7, y: 96, width: 226.8, height: 141.7, rotation: 0, zIndex: 1, required: true,
      properties: { fitMode: "contain", border: true, borderWidth: 1, borderRadius: 0, text: "", fontSize: 12, fontFamily: "Inter", fontWeight: "400", textAlign: "left", color: "#17211c", fill: "#eef2f4", stroke: "#63716a", strokeWidth: 1 },
    },
    {
      id: randomUUID(), type: "TEXT" as const, name: "Nombre cliente", key: null,
      page: 1, x: 56.7, y: 260, width: 220, height: 36, rotation: 0, zIndex: 2, required: false,
      properties: { fitMode: "contain", border: false, borderWidth: 0, borderRadius: 0, text: "{{cliente_nombre}}", fontSize: 14, fontFamily: "Inter", fontWeight: "600", textAlign: "left", color: "#17211c", fill: "#eef2f4", stroke: "#63716a", strokeWidth: 1 },
    },
    {
      id: randomUUID(), type: "RECTANGLE" as const, name: "Marco", key: null,
      page: 1, x: 40, y: 80, width: 520, height: 240, rotation: 0, zIndex: 0, required: false,
      properties: { fitMode: "contain", border: true, borderWidth: 1, borderRadius: 6, text: "", fontSize: 12, fontFamily: "Inter", fontWeight: "400", textAlign: "left", color: "#17211c", fill: "#eef2f4", stroke: "#63716a", strokeWidth: 1 },
    },
    {
      id: randomUUID(), type: "LINE" as const, name: "Separador", key: null,
      page: 1, x: 40, y: 340, width: 520, height: 2, rotation: 0, zIndex: 3, required: false,
      properties: { fitMode: "contain", border: false, borderWidth: 0, borderRadius: 0, text: "", fontSize: 12, fontFamily: "Inter", fontWeight: "400", textAlign: "left", color: "#17211c", fill: "#eef2f4", stroke: "#63716a", strokeWidth: 2 },
    },
  ];
}

function createVersion(templateId: string) {
  return prisma.templateVersion.create({
    data: {
      templateId,
      versionNumber: 1,
      paperSize: "A4",
      orientation: "PORTRAIT",
      width: 595.28,
      height: 841.89,
      isActive: true,
    },
  });
}

function createStoredFile(userId: string, label: string) {
  return prisma.storedFile.create({
    data: {
      originalName: `${label}.png`,
      storageKey: `integration/${randomUUID()}/${label}.png`,
      bucket: "uploads",
      type: "IMAGE",
      mimeType: "image/png",
      sizeBytes: 128n,
      createdById: userId,
    },
  });
}

function createGeneration(input: {
  userId: string;
  templateId: string;
  versionId: string;
  fileId: string;
  allocated: { sequenceNumber: number; number: string };
}) {
  return prisma.generation.create({
    data: {
      sequenceNumber: input.allocated.sequenceNumber,
      number: input.allocated.number,
      templateId: input.templateId,
      templateVersionId: input.versionId,
      createdById: input.userId,
      outputFileId: input.fileId,
      status: "COMPLETED",
    },
  });
}

