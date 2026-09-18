import { useQuery } from "@tanstack/react-query";

import { apiJson } from "@/lib/api";

export interface CompanySettings {
  id: string;
  name: string;
  tradeName: string | null;
  legalName: string | null;
  documentNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  logoUrl: string | null;
  logoFileId: string | null;
  logoFile: { id: string; originalName: string; mimeType: string; sizeBytes: string; width: number | null; height: number | null } | null;
  description: string | null;
  slogan: string | null;
  footerText: string | null;
  displayName: string;
  updatedAt?: string;
}

export function useCompanySettings() {
  return useQuery({ queryKey: ["company"], queryFn: () => apiJson<CompanySettings>("/company"), staleTime: 30_000 });
}
