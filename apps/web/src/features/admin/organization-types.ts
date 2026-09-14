export type OrganizationStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

export interface OrganizationItem {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  status: OrganizationStatus;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  templateCount: number;
  generationCount: number;
}

export interface OrganizationPageResponse {
  items: OrganizationItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function organizationStatusLabel(status: OrganizationStatus) {
  return status === "ACTIVE" ? "Activa" : status === "SUSPENDED" ? "Suspendida" : "Archivada";
}

export function organizationStatusClass(status: OrganizationStatus) {
  return status === "ACTIVE" ? "status-completed" : status === "SUSPENDED" ? "status-processing" : "status-failed";
}
