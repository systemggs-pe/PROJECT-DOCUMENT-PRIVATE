# GGS Document Studio Architecture

## System Flow

```text
Frontend
  |
  v
NestJS API
  |
  v
PostgreSQL
  |
  v
Storage
```

The frontend never accesses PostgreSQL directly. Sensitive operations pass through the NestJS API, where authentication, authorization, validation, and auditing are enforced.

## Authentication And Authorization

```text
Supabase Auth
  |
  v
Frontend session
  |
  v
Authorization: Bearer access_token
  |
  v
NestJS AuthGuard
  |
  v
Current User + RBAC permissions
  |
  v
Ownership checks
```

Authentication answers "who are you?" through Supabase Auth and cryptographically verified JWTs. Authorization answers "can you access this?" through NestJS RBAC and ownership checks against PostgreSQL. Frontend route protection is a UX layer only; it is not treated as a security boundary.

The API is protected by default. Public endpoints must be explicitly marked with `@Public()`, such as `GET /health`. Protected handlers access identity through `@CurrentUser()` and must not trust `userId` or `createdById` from body, query, or route parameters as the authenticated identity.

RBAC uses `User`, `Role`, `Permission`, `UserRole`, and `RolePermission`. `AuthorizationService` resolves roles and permissions, while `PermissionsGuard` enforces `@Permissions(...)` metadata before controller logic runs.

## Document Flow

```text
Template
  |
  v
TemplateVersion
  |
  v
TemplateElements
  |
  v
Generation
  |
  v
PDF
  |
  v
Storage
```

Templates are logical containers. Template versions preserve the exact document layout used at generation time. Template elements describe visual primitives and image slots. A generation references the exact template version used, so future template edits do not mutate historical documents.

## Source Of Truth

PostgreSQL is the source of truth for metadata:

- users
- roles and permissions
- templates
- template versions
- template elements
- generations
- generation inputs
- stored files
- audit logs

Storage is the source of truth for binary data:

- original uploads
- generated PDFs
- future thumbnails or derived assets

## Database Layer

The API owns Prisma Client through a single NestJS `PrismaService`. Application modules must receive database access through dependency injection rather than constructing Prisma clients directly.

Generation numbering is allocated in PostgreSQL through `generation_counters`, not in the frontend, `localStorage`, process memory, or an unsafe "last row plus one" query.

See `docs/database.md` for model details, deletion policy, indexes, and correlation strategy.
See `docs/templates.md` for template states, version operations, ownership, coordinates, and historical protection.
See `docs/editor.md` for the visual editor, canvas model, save behavior, and Phase 6 boundary.
See `docs/storage.md` for file upload, private bucket access, object paths, signed URLs, and cleanup policy.
See `docs/generation-history.md` for history queries, filters, pagination, detail, download, deletion, and cleanup policy.
See `docs/authorization.md` for RBAC, system roles, permission catalog, SUPERADMIN bootstrap, and privilege-escalation rules.

## Ownership Boundary

`organizationId` and `createdById` are server-owned identity fields. ADMIN resources are scoped to the active organization, USER resources remain owner-scoped, and SUPERADMIN is platform-scoped. Resource-by-ID lookups combine the identifier with the applicable tenant/ownership predicate and return 404 for foreign resources to avoid enumeration.

## Phase 8 Generation Boundary

The current implementation provides the foundational project structure, health check, shared packages, Prisma bootstrap, UI shell, PostgreSQL model, Supabase Auth integration, RBAC authorization, ownership checks, template/version management, a point-based visual editor, private Storage, a file library, the independent PDF engine package, and individual dynamic generation.

The generation layer derives slots from the selected version, resolves private image assets and text variables, renders in memory, allocates PostgreSQL correlatives atomically, persists an immutable snapshot, writes the output to private Storage under the organization path, and exposes tenant-protected download and audit events. Bulk generation, queues, collaboration, billing, OCR, real QR/barcodes, and role hierarchies remain outside the scope.
