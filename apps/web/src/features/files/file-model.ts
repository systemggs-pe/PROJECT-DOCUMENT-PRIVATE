export interface StoredFile {
  id: string;
  originalName: string;
  storageKey: string;
  bucket: string;
  type: "IMAGE" | "PDF";
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
const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

export function validateFile(file: File) {
  if (!allowedTypes.includes(file.type)) return "Este formato de archivo no esta permitido.";
  if (file.size > maxBytes) return "El archivo supera el tamano permitido de 10 MB.";
  if (!/\.(jpe?g|png|webp)$/i.test(file.name)) return "La extension del archivo no esta permitida.";
  return "";
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
