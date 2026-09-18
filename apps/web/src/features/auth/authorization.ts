import { useQuery } from "@tanstack/react-query";

import { getMe } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import type { NavigationSection } from "@/stores/navigation-store";

export const MODULE_PERMISSIONS: Partial<Record<NavigationSection, string[]>> = {
  dashboard: [],
  generate: ["generations.create"],
  generations: ["generations.read"],
  templates: ["templates.read"],
  files: ["files.read"],
  fileFields: ["file_fields.read"],
  company: ["company.read"],
  users: ["users.read"],
  roles: ["roles.read", "permissions.read"],
  audit: ["audit.read"],
  support: [],
  settings: [],
};

export function useCurrentIdentity() {
  const session = useAuthStore((state) => state.session);
  return useQuery({
    queryKey: ["identity", session?.user.id, session?.access_token],
    queryFn: getMe,
    retry: false,
    staleTime: 30_000,
    enabled: Boolean(session),
  });
}

export function useCan(permission: string) {
  const identity = useCurrentIdentity();
  return hasPermission(identity.data, permission);
}

export function can(identity: { permissions: string[] } | undefined, permission: string) {
  return hasPermission(identity, permission);
}

export function hasPermission(identity: { permissions: string[]; roles?: Array<{ key: string }> } | undefined, permission: string) {
  return Boolean(identity?.roles?.some((role) => role.key === "SUPERADMIN") || identity?.permissions.includes(permission));
}

export function canAccessModule(identity: { permissions: string[]; roles?: Array<{ key: string }> } | undefined, module: NavigationSection) {
  const permissions = MODULE_PERMISSIONS[module] ?? [];
  return permissions.length === 0 || permissions.some((permission) => hasPermission(identity, permission));
}
