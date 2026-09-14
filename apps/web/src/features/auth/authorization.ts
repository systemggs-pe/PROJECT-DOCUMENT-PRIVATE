import { useQuery } from "@tanstack/react-query";

import { getMe } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

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
  return Boolean(identity.data?.permissions.includes(permission));
}

export function can(identity: { permissions: string[] } | undefined, permission: string) {
  return Boolean(identity?.permissions.includes(permission));
}

