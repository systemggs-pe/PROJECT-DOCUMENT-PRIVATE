import "dotenv/config";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const databaseUrl =
  process.env["DATABASE_URL"] ??
  "postgresql://ggs:desarrollo-local@localhost:5432/ggs_document_studio?schema=public";
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

const permissions = [
  "users.read", "users.create", "users.update", "users.deactivate",
  "company.read", "company.update",
  "roles.read", "roles.create", "roles.update", "roles.delete",
  "permissions.read", "permissions.assign",
  "templates.read", "templates.create", "templates.update", "templates.delete",
  "template_versions.read", "template_versions.create", "template_versions.update", "template_versions.delete",
  "files.read", "files.upload", "files.delete",
  "file_fields.read", "file_fields.create", "file_fields.update", "file_fields.delete",
  "generations.read", "generations.create", "generations.delete", "generations.download",
  "audit.read",
] as const;

const rolePermissionMap = {
  SUPERADMIN: permissions,
  ADMIN: [
    "users.read", "users.create", "users.update", "users.deactivate",
    "company.read", "company.update",
    "roles.read", "roles.create", "roles.update",
    "permissions.read", "permissions.assign",
    "templates.read", "templates.create", "templates.update", "templates.delete",
    "template_versions.read", "template_versions.create", "template_versions.update", "template_versions.delete",
    "files.read", "files.upload", "files.delete",
    "file_fields.read", "file_fields.create", "file_fields.update", "file_fields.delete",
    "generations.read", "generations.create", "generations.delete", "generations.download",
  ],
  USER: [
    "templates.read", "templates.create", "templates.update", "templates.delete",
    "template_versions.read", "template_versions.create", "template_versions.update", "template_versions.delete",
    "files.read", "files.upload", "files.delete",
    "file_fields.read",
    "generations.read", "generations.create", "generations.delete", "generations.download",
  ],
} as const;

type RoleKey = keyof typeof rolePermissionMap;

async function main(): Promise<void> {
  await prisma.companySettings.upsert({
    where: { id: "global" },
    update: {
      name: "Empresa",
      country: "Peru",
    },
    create: {
      id: "global",
      name: "Empresa",
      country: "Peru",
    },
  });

  for (const key of permissions) {
    await prisma.permission.upsert({
      where: { key },
      update: { name: humanizePermission(key), metadata: { group: key.split(".")[0] } },
      create: { key, name: humanizePermission(key), metadata: { group: key.split(".")[0] } },
    });
  }

  await seedSystemFileFields();

  const roles = {} as Record<RoleKey, { id: string }>;
  for (const key of Object.keys(rolePermissionMap) as RoleKey[]) {
    roles[key] = await prisma.role.upsert({
      where: { key },
      update: { name: roleName(key), isSystem: true, isActive: true },
      create: { key, name: roleName(key), isSystem: true, isActive: true },
      select: { id: true },
    });
    const rolePermissions = await prisma.permission.findMany({ where: { key: { in: [...rolePermissionMap[key]] } }, select: { id: true } });
    await prisma.rolePermission.deleteMany({ where: { roleId: roles[key].id } });
    await prisma.rolePermission.createMany({ data: rolePermissions.map((permission) => ({ roleId: roles[key].id, permissionId: permission.id })), skipDuplicates: true });
  }

  const demoUser = await prisma.user.upsert({
    where: {
      email: "demo@ggs.local",
    },
    update: {
      name: "Demo User",
      isActive: true,
    },
    create: {
      email: "demo@ggs.local",
      authProviderId: "demo-local-user",
      name: "Demo User",
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: demoUser.id, roleId: roles.USER.id } },
    update: {},
    create: { userId: demoUser.id, roleId: roles.USER.id },
  });

  const template = await prisma.template.upsert({
    where: {
      id: "00000000-0000-4000-8000-000000000101",
    },
    update: {
      name: "DNI + Foto",
      description: "Plantilla demo para comprobar image slots dinamicos.",
      status: "ACTIVE",
    },
    create: {
      id: "00000000-0000-4000-8000-000000000101",
      name: "DNI + Foto",
      description: "Plantilla demo para comprobar image slots dinamicos.",
      status: "ACTIVE",
      createdById: demoUser.id,
    },
  });

  const version = await prisma.templateVersion.upsert({
    where: {
      templateId_versionNumber: {
        templateId: template.id,
        versionNumber: 1,
      },
    },
    update: {
      isActive: true,
    },
    create: {
      templateId: template.id,
      versionNumber: 1,
      paperSize: "A4",
      orientation: "PORTRAIT",
      width: 595.28,
      height: 841.89,
      marginTop: 28.35,
      marginRight: 28.35,
      marginBottom: 28.35,
      marginLeft: 28.35,
      isActive: true,
    },
  });

  await prisma.templateElement.createMany({
    data: [
      imageSlot(version.id, "dni_front", "DNI frontal", 56.7, 96, 226.8, 141.7, 1),
      imageSlot(version.id, "dni_back", "DNI trasero", 311.8, 96, 226.8, 141.7, 2),
      imageSlot(version.id, "photo", "Foto", 56.7, 278.4, 113.4, 141.7, 3),
    ],
    skipDuplicates: true,
  });

  await prisma.generationCounter.upsert({
    where: {
      key: "default",
    },
    update: {},
    create: {
      key: "default",
      prefix: "GGS",
      padding: 6,
      currentValue: 0,
    },
  });
}

async function seedSystemFileFields() {
  await prisma.fileField.upsert({
    where: { key: "foto_principal" },
    update: {
      label: "Foto principal",
      source: "SYSTEM",
      isActive: true,
      acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      maxFiles: 1,
      maxFileSize: 10 * 1024 * 1024,
      sortOrder: 10,
    },
    create: {
      id: "00000000-0000-4000-8000-000000000201",
      key: "foto_principal",
      label: "Foto principal",
      description: "Campo precargado para imagenes del documento.",
      required: true,
      acceptedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      maxFiles: 1,
      maxFileSize: 10 * 1024 * 1024,
      source: "SYSTEM",
      sortOrder: 10,
    },
  });
  await prisma.fileField.upsert({
    where: { key: "documento_principal" },
    update: {
      label: "Documento principal",
      source: "SYSTEM",
      isActive: true,
      acceptedMimeTypes: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      maxFiles: 1,
      maxFileSize: 10 * 1024 * 1024,
      sortOrder: 20,
    },
    create: {
      id: "00000000-0000-4000-8000-000000000202",
      key: "documento_principal",
      label: "Documento principal",
      description: "Campo precargado para PDF, DOC o DOCX.",
      required: false,
      acceptedMimeTypes: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      maxFiles: 1,
      maxFileSize: 10 * 1024 * 1024,
      source: "SYSTEM",
      sortOrder: 20,
    },
  });
}

function humanizePermission(key: string) {
  const [resource = "permiso", action = "usar"] = key.split(".");
  return `${resource.replaceAll("_", " ")} ${action}`;
}

function roleName(key: RoleKey) {
  return key === "SUPERADMIN" ? "Superadministrador" : key === "ADMIN" ? "Administrador" : "Usuario";
}

function imageSlot(
  templateVersionId: string,
  key: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
) {
  return {
    templateVersionId,
    type: "IMAGE" as const,
    key,
    name,
    page: 1,
    x,
    y,
    width,
    height,
    rotation: 0,
    zIndex,
    required: true,
    properties: {
      fitMode: "contain",
      border: true,
      borderWidth: 1,
      borderRadius: 0,
    },
  };
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
