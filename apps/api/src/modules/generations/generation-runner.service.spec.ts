import { BadRequestException } from "@nestjs/common";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";

import type { GenerationNumberService } from "../../common/database/generation-number.service";
import type { PrismaService } from "../../common/database/prisma.service";
import type { PdfService } from "../pdf/pdf.service";
import type { CurrentUser } from "../auth/types/current-user";
import type { StorageService } from "../storage/storage.service";
import type { GenerationsService } from "./generations.service";
import type { DocumentConversionService } from "../document-conversion/document-conversion.service";
import { GenerationRunnerService } from "./generation-runner.service";

const userId = "11111111-1111-4111-8111-111111111111";
const companyId = "00000000-0000-4000-8000-000000000201";
const templateId = "22222222-2222-4222-8222-222222222222";
const versionId = "33333333-3333-4333-8333-333333333333";
const imageId = "44444444-4444-4444-8444-444444444444";
const attachmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const documentId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("GenerationRunnerService", () => {
  it("resolves dynamic slots and variables before reserving a number", async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from("%PDF-test"));
    const generation = { id: "55555555-5555-4555-8555-555555555555", number: "GGS-000042" };
    const tx = makeTransaction({ generation, renderVersion: version() });
    const storage = makeStorage();
    const service = makeRunner(tx, storage, render);

    const result = await service.generate(actor(userId), {
      templateId,
      templateVersionId: versionId,
      requestKey: "66666666-6666-4666-8666-666666666666",
      inputs: { photo: { storedFileId: imageId } },
      variables: { customer_name: "Ana" },
    });

    expect(result).toEqual(expect.objectContaining({ id: "generation-result" }));
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ elements: expect.arrayContaining([expect.objectContaining({ type: "IMAGE", assetKey: imageId }), expect.objectContaining({ type: "TEXT", properties: expect.objectContaining({ text: "Cliente: Ana" }) })]) }), expect.arrayContaining([expect.objectContaining({ key: imageId })]));
    expect(tx.generation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ number: generation.number, status: "PROCESSING" }) }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "GENERATE" }) }));
  });

  it("rejects an unknown input slot before reading storage or reserving a number", async () => {
    const render = vi.fn();
    const tx = makeTransaction({ renderVersion: version() });
    const storage = makeStorage();
    const numbers = { next: vi.fn() };
    const service = makeRunner(tx, storage, render, numbers);

    await expect(service.generate(actor(userId), {
      templateVersionId: versionId,
      requestKey: "77777777-7777-4777-8777-777777777777",
      inputs: [{ key: "not_in_template", fileId: imageId }],
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(storage.read).not.toHaveBeenCalled();
    expect(numbers.next).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("renders preview with the same renderer without creating a final generation", async () => {
    const mainPdf = await makePdf("preview");
    const render = vi.fn().mockResolvedValue(mainPdf);
    const tx = makeTransaction({ renderVersion: version() });
    const storage = makeStorage();
    const numbers = { next: vi.fn() };
    const service = makeRunner(tx, storage, render, numbers);

    const result = await service.preview(actor(userId), {
      templateVersionId: versionId,
      requestKey: "78787878-7878-4787-8787-787878787878",
      inputs: [{ key: "photo", fileId: imageId }],
      variables: { customer_name: "Ana" },
    });

    expect(result.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(render).toHaveBeenCalledWith(expect.objectContaining({ elements: expect.arrayContaining([expect.objectContaining({ type: "IMAGE", assetKey: imageId })]) }), expect.arrayContaining([expect.objectContaining({ key: imageId })]));
    expect(numbers.next).not.toHaveBeenCalled();
    expect(tx.generation.create).not.toHaveBeenCalled();
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("uses the same render path for preview and final generation", async () => {
    const service = makeRunner(makeTransaction({ renderVersion: version() }), makeStorage(), vi.fn().mockResolvedValue(await makePdf("same")));
    const prototype = Object.getPrototypeOf(service) as { renderPreparedPdf?: unknown };

    expect(typeof prototype.renderPreparedPdf).toBe("function");
  });

  it("removes a generated object and marks the reserved generation failed when upload fails", async () => {
    const tx = makeTransaction({ generation: { id: "88888888-8888-4888-8888-888888888888", number: "GGS-000043" }, renderVersion: version() });
    const storage = makeStorage();
    storage.put.mockRejectedValue(new Error("storage down"));
    const service = makeRunner(tx, storage, vi.fn().mockResolvedValue(Buffer.from("%PDF-test")));

    await expect(service.generate(actor(userId), {
      templateVersionId: versionId,
      requestKey: "99999999-9999-4999-8999-999999999999",
      inputs: [{ key: "photo", fileId: imageId }],
    })).rejects.toThrow("No se pudo generar el documento");

    expect(storage.remove).toHaveBeenCalledWith(expect.stringMatching(/^company\/generations\//));
    expect(tx.generation.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
  });

  it("appends selected PDF attachments to the generated PDF in order", async () => {
    const mainPdf = await makePdf("principal");
    const attachmentPdf = await makePdf("anexo");
    const render = vi.fn().mockResolvedValue(mainPdf);
    const tx = makeTransaction({
      generation: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", number: "GGS-000044" },
      renderVersion: version(),
      attachmentFiles: [{ id: attachmentId, storageKey: `organizations/${companyId}/files/${attachmentId}/original.pdf`, bucket: "ggs-documents", mimeType: "application/pdf", originalName: "anexo.pdf" }],
    });
    const storage = makeStorage();
    storage.read.mockResolvedValueOnce(Buffer.from("image")).mockResolvedValueOnce(attachmentPdf);
    const service = makeRunner(tx, storage, render);

    await service.generate(actor(userId), {
      templateVersionId: versionId,
      requestKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      inputs: [{ key: "photo", fileId: imageId }],
      attachments: [{ fileId: attachmentId, order: 0 }],
    });

    const uploadedPdf = storage.put.mock.calls[0]?.[1] as Buffer;
    const merged = await PDFDocument.load(uploadedPdf);
    expect(merged.getPageCount()).toBe(2);
    expect(tx.generation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ attachments: { create: [{ fileId: attachmentId, order: 0 }] } }) }));
  });

  it("converts DOCX attachments before merging them between PDFs", async () => {
    const mainPdf = await makePdf("principal");
    const firstAttachment = await makePdf("anexo-1");
    const convertedDocx = await makePdf("docx-convertido");
    const secondAttachment = await makePdf("anexo-2");
    const docxContent = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const converter = { convertToPdf: vi.fn().mockResolvedValue(convertedDocx) };
    const tx = makeTransaction({
      generation: { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", number: "GGS-000045" },
      renderVersion: version(),
      attachmentFiles: [
        { id: attachmentId, storageKey: `organizations/${companyId}/files/${attachmentId}/original.pdf`, bucket: "ggs-documents", type: "PDF", mimeType: "application/pdf", originalName: "anexo-1.pdf" },
        { id: documentId, storageKey: `organizations/${companyId}/files/${documentId}/original.docx`, bucket: "ggs-documents", type: "DOCUMENT", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", originalName: "contrato.docx" },
        { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", storageKey: `organizations/${companyId}/files/ffffffff-ffff-4fff-8fff-ffffffffffff/original.pdf`, bucket: "ggs-documents", type: "PDF", mimeType: "application/pdf", originalName: "anexo-2.pdf" },
      ],
    });
    const storage = makeStorage();
    storage.read.mockResolvedValueOnce(Buffer.from("image")).mockResolvedValueOnce(firstAttachment).mockResolvedValueOnce(docxContent).mockResolvedValueOnce(secondAttachment);
    const service = makeRunner(tx, storage, vi.fn().mockResolvedValue(mainPdf), undefined, converter);

    await service.generate(actor(userId), {
      templateVersionId: versionId,
      requestKey: "12121212-1212-4212-8212-121212121212",
      inputs: [{ key: "photo", fileId: imageId }],
      attachments: [
        { fileId: attachmentId, order: 0 },
        { fileId: documentId, order: 1 },
        { fileId: "ffffffff-ffff-4fff-8fff-ffffffffffff", order: 2 },
      ],
    });

    const uploadedPdf = storage.put.mock.calls[0]?.[1] as Buffer;
    const merged = await PDFDocument.load(uploadedPdf);
    expect(merged.getPageCount()).toBe(4);
    expect(converter.convertToPdf).toHaveBeenCalledWith({ data: docxContent, originalName: "contrato.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  });
});

function makeRunner(tx: ReturnType<typeof makeTransaction>, storage: ReturnType<typeof makeStorage>, render: ReturnType<typeof vi.fn>, numbers = { next: vi.fn().mockResolvedValue({ sequenceNumber: 42, number: "GGS-000042" }) }, converter = { convertToPdf: vi.fn() }) {
  const prisma = { client: { $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) } } as unknown as PrismaService;
  const pdf = { renderTemplateVersion: render } as unknown as PdfService;
  const generations = { findOwnedOrThrow: vi.fn().mockResolvedValue({ id: "generation-result", status: "COMPLETED" }) } as unknown as GenerationsService;
  return new GenerationRunnerService(prisma, numbers as unknown as GenerationNumberService, storage as unknown as StorageService, pdf, generations, converter as unknown as DocumentConversionService);
}

function makeStorage() {
  return { bucket: "ggs-documents", read: vi.fn().mockResolvedValue(Buffer.from("image")), put: vi.fn().mockResolvedValue(undefined), remove: vi.fn().mockResolvedValue(undefined) };
}

function makeTransaction({ generation, renderVersion, attachmentFiles = [] }: { generation?: { id: string; number: string }; renderVersion: ReturnType<typeof version>; attachmentFiles?: Array<{ id: string; storageKey: string; bucket: string; type?: "PDF" | "DOCUMENT"; mimeType: string; originalName: string }> }) {
  const created = generation ? { ...generation, status: "PROCESSING" } : null;
  return {
    $queryRaw: vi.fn().mockResolvedValue([{ id: userId }]),
    generation: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(created),
      update: vi.fn().mockResolvedValue({}),
    },
    templateVersion: { findFirst: vi.fn().mockResolvedValue(renderVersion) },
    storedFile: {
      findMany: vi.fn(({ where }) => Promise.resolve(where.type === "PDF" || where.type?.in ? attachmentFiles.map((file) => ({ type: "PDF", ...file })) : [{ id: imageId, storageKey: `organizations/${companyId}/files/${imageId}/original.jpg`, bucket: "ggs-documents", type: "IMAGE", mimeType: "image/jpeg", originalName: "photo.jpg" }])),
      create: vi.fn().mockResolvedValue({ id: "output-file" }),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

async function makePdf(label: string) {
  const document = await PDFDocument.create();
  const page = document.addPage([200, 200]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText(label, { x: 20, y: 100, size: 12, font });
  return Buffer.from(await document.save());
}

function actor(id: string): CurrentUser {
  const roles = [{ id: "USER", key: "USER", name: "Usuario", isSystem: true }];
  return { id, authProviderId: id, email: `${id}@example.com`, name: null, avatarUrl: null, isActive: true, status: "ACTIVE", roles, permissions: [], authorization: { roles, permissions: [] } };
}

function version() {
  return {
    id: versionId,
    templateId,
    versionNumber: 1,
    paperSize: "A4",
    orientation: "PORTRAIT",
    width: { toNumber: () => 595.28 },
    height: { toNumber: () => 841.89 },
    pageCount: 1,
    elements: [
      { id: "slot-photo", type: "IMAGE", name: "Foto", key: "photo", page: 1, x: 20, y: 20, width: 100, height: 100, rotation: 0, zIndex: 1, required: true, properties: { fitMode: "contain" } },
      { id: "text-customer", type: "TEXT", name: "Cliente", key: null, page: 1, x: 20, y: 140, width: 200, height: 30, rotation: 0, zIndex: 2, required: false, properties: { text: "Cliente: {{customer_name}}", fontSize: 12 } },
    ],
    template: { id: templateId, name: "DNI" },
  };
}



