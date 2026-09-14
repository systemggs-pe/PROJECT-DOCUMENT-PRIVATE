# Authorization

GGS Document Studio uses Supabase Auth only for authentication. The NestJS API is the source of truth for authorization.

## RBAC Model

- `User`: local identity synchronized from the Supabase JWT. It stores email, name, avatar, `isActive`, `lastLoginAt`, and optional `managedById` for the current administrator scope.
- `Role`: assignable access profile. System roles are protected with `isSystem`.
- `Permission`: system-controlled catalog. Users cannot invent arbitrary permission keys.
- `UserRole`: many-to-many assignment between users and roles.
- `RolePermission`: many-to-many assignment between roles and permissions.

## System Roles

- `SUPERADMIN`: global administration. It receives every current permission and can access global administrative views.
- `ADMIN`: operational administrator. It can manage users assigned to its scope, roles, templates, files, generations, and downloads according to permissions.
- `USER`: default document user. It can read templates, upload/read files, create/read/download generations.

## Permission Catalog

- `users.read`, `users.create`, `users.update`, `users.deactivate`
- `roles.read`, `roles.create`, `roles.update`, `roles.delete`
- `permissions.read`, `permissions.assign`
- `templates.read`, `templates.create`, `templates.update`, `templates.delete`
- `template_versions.read`, `template_versions.create`, `template_versions.update`, `template_versions.delete`
- `files.read`, `files.upload`, `files.delete`
- `generations.read`, `generations.create`, `generations.delete`, `generations.download`
- `audit.read`

## SUPERADMIN Bootstrap

`SUPERADMIN_EMAIL` is a backend-only environment variable. When Supabase Auth validates a JWT and the email matches this value, the local user is assigned the `SUPERADMIN` role if it has no role yet.

The frontend cannot elevate a user. Roles and permissions are read from PostgreSQL through `/auth/me`.

## Ownership And Scope

RBAC does not replace ownership. Resource queries for templates, files, generations, downloads, and signed URLs still filter by the authenticated user id.

For user management, the current scope is intentionally simple until organizations exist:

- `SUPERADMIN`: global users.
- `ADMIN`: self plus users with `managedById = admin.id`.
- `USER`: self only, unless backend permissions and scope rules allow more later.

Fase 11 will introduce explicit organizations/tenants. This phase avoids subscription, billing, quotas, and plan logic.

## Privilege Escalation Rules

- Users cannot modify their own roles.
- ADMIN cannot assign `SUPERADMIN`.
- ADMIN cannot modify system roles.
- ADMIN cannot modify a SUPERADMIN user.
- System roles cannot be deleted.
- Assigned custom roles cannot be deleted.
- Role replacement is transactional.

## Backend Enforcement

Controllers use `@Permissions(...)`; `PermissionsGuard` runs after Supabase authentication. `AuthorizationService` resolves effective roles and permissions centrally.

The frontend only reflects permissions for navigation and route UX. Direct manipulated requests still require backend permissions.

## Audit

Administrative changes record audit rows with safe metadata:

- `USER_CREATED`, `USER_UPDATED`, `USER_ACTIVATED`, `USER_DEACTIVATED`
- `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED`
- `ROLE_ASSIGNED_ON_SYNC`, `ROLE_ASSIGNMENT_REPLACED`

Audit logs do not store passwords, JWTs, signed URLs, or service-role secrets.
