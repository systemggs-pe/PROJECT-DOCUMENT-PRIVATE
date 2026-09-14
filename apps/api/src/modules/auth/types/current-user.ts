import type { PermissionKey } from "../authorization.constants";

export interface CurrentUser {
  id: string;
  authProviderId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  status: "ACTIVE" | "INACTIVE";
  organizationId: string | null;
  organization: { id: string; name: string; slug: string; status: "ACTIVE" | "SUSPENDED" | "ARCHIVED" } | null;
  roles: Array<{ id: string; key: string; name: string; isSystem: boolean }>;
  permissions: PermissionKey[];
  authorization: {
    roles: Array<{ id: string; key: string; name: string; isSystem: boolean }>;
    permissions: PermissionKey[];
  };
}

export interface SupabaseIdentity {
  authProviderId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface AuthenticatedRequest {
  user?: CurrentUser;
}
