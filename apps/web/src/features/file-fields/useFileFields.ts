import { useQuery } from "@tanstack/react-query";

import { apiJson } from "@/lib/api";
import type { FileFieldPage } from "./file-field-model";

export function useFileFields(params = "") {
  return useQuery({
    queryKey: ["file-fields", params],
    queryFn: () => apiJson<FileFieldPage>(`/file-fields${params}`),
    staleTime: 30_000,
  });
}
