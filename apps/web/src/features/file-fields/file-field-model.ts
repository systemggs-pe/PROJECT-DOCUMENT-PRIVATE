export interface FileField {
  id: string;
  key: string;
  label: string;
  description: string | null;
  required: boolean;
  acceptedMimeTypes: string[];
  maxFiles: number;
  maxFileSize: number;
  source: "SYSTEM" | "CUSTOM";
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface FileFieldPage {
  items: FileField[];
}

export const mimeOptions = [
  { value: "image/jpeg", label: "JPG" },
  { value: "image/png", label: "PNG" },
  { value: "image/webp", label: "WebP" },
  { value: "application/pdf", label: "PDF" },
] as const;

export function describeMimeTypes(values: string[]) {
  if (!values.length) return "Sin tipos";
  return values.map((value) => mimeOptions.find((option) => option.value === value)?.label ?? value).join(", ");
}
