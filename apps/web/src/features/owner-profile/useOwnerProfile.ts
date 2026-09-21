import { useQuery } from "@tanstack/react-query";

import { apiJson } from "@/lib/api";

export interface OwnerProfile {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export function useOwnerProfile() {
  return useQuery({ queryKey: ["owner-profile"], queryFn: () => apiJson<OwnerProfile>("/owner-profile"), staleTime: 30_000 });
}
