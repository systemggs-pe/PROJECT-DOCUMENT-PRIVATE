export interface StoredFile {
  id: string;
  originalName: string;
  storageKey: string;
  bucket: string;
  type: "IMAGE" | "PDF" | "DOCUMENT";
  mimeType: string;
  sizeBytes: string;
  width: number | null;
  height: number | null;
  checksum: string | null;
  createdAt: string;
}

export interface FilePage {
  items: StoredFile[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const maxBytes = 10 * 1024 * 1024;
const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

export function validateFile(file: File) {
  if (!allowedTypes.includes(file.type)) return "Este formato de archivo no esta permitido.";
  if (file.size > maxBytes) return "El archivo supera el tamaño permitido de 10 MB.";
  if (!/\.(jpe?g|png|webp|pdf|docx?)$/i.test(file.name)) return "La extension del archivo no esta permitida.";
  if (file.type === "application/pdf" && !/\.pdf$/i.test(file.name)) return "La extension del archivo no coincide con el formato.";
  if (file.type === "application/msword" && !/\.doc$/i.test(file.name)) return "La extension del archivo no coincide con el formato.";
  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" && !/\.docx$/i.test(file.name)) return "La extension del archivo no coincide con el formato.";
  return "";
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
