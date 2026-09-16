import { BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const supportedMimeTypes = new Map<string, ".doc" | ".docx">([
  ["application/msword", ".doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
]);

@Injectable()
export class DocumentConversionService {
  private readonly logger = new Logger(DocumentConversionService.name);
  private readonly binary: string;
  private readonly timeoutMs: number;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.binary = config.get<string>("LIBREOFFICE_BIN")?.trim() || (process.platform === "win32" ? "soffice" : "libreoffice");
    this.timeoutMs = Number(config.get<string>("DOCUMENT_CONVERSION_TIMEOUT_MS") ?? "30000");
  }

  async convertToPdf(file: { data: Buffer; originalName: string; mimeType: string }) {
    const extension = supportedMimeTypes.get(file.mimeType);
    if (!extension) throw new BadRequestException(`El archivo ${file.originalName} no se puede convertir a PDF.`);
    if (!hasExpectedSignature(file.data, extension)) throw new BadRequestException(`No se pudo convertir "${file.originalName}" a PDF. Verifica que el documento no este danado o utiliza otro archivo.`);

    const directory = await mkdtemp(join(tmpdir(), "ggs-doc-conversion-"));
    const sourceName = `source${extension}`;
    const sourcePath = join(directory, sourceName);
    const outputPath = join(directory, "source.pdf");
    try {
      await writeFile(sourcePath, file.data, { flag: "wx" });
      await execFileAsync(this.binary, [
        "--headless",
        "--nologo",
        "--nodefault",
        "--nofirststartwizard",
        "--nolockcheck",
        "--convert-to",
        "pdf",
        "--outdir",
        directory,
        sourcePath,
      ], {
        cwd: directory,
        timeout: Number.isFinite(this.timeoutMs) && this.timeoutMs > 0 ? this.timeoutMs : 30000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
      const pdf = await readFile(outputPath);
      if (!hasPdfSignature(pdf)) throw new BadRequestException(`No se pudo convertir "${file.originalName}" a PDF. Verifica que el documento no este danado o utiliza otro archivo.`);
      return pdf;
    } catch (error) {
      if (isMissingBinary(error)) {
        throw new ServiceUnavailableException(`La conversion DOC/DOCX requiere LibreOffice en el backend. Configura LIBREOFFICE_BIN para habilitar "${basename(file.originalName)}".`);
      }
      if (isTimeout(error)) {
        throw new ServiceUnavailableException(`La conversion de "${basename(file.originalName)}" supero el tiempo maximo permitido.`);
      }
      if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) throw error;
      this.logger.error(`Document conversion failed for ${basename(file.originalName)}`);
      throw new BadRequestException(`No se pudo convertir "${basename(file.originalName)}" a PDF. Verifica que el documento no este danado o utiliza otro archivo.`);
    } finally {
      await rm(directory, { recursive: true, force: true }).catch(() => this.logger.error(`Temporary conversion cleanup failed: ${directory}`));
    }
  }
}

function hasExpectedSignature(buffer: Buffer, extension: ".doc" | ".docx") {
  if (extension === ".doc") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
}

function hasPdfSignature(buffer: Buffer) {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function isMissingBinary(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function isTimeout(error: unknown) {
  return typeof error === "object" && error !== null && "killed" in error && (error as { killed?: unknown }).killed === true;
}
