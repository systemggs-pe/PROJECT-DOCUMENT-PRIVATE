# GGS Document Studio

GGS Document Studio is a professional document-template platform for creating reusable visual templates, collecting the image inputs required by each template, and generating private PDFs with traceable metadata.

The project is being built in phases. This repository currently contains the Phase 8 individual-generation slice: a pnpm TypeScript monorepo, a React frontend, a NestJS API, shared packages, Prisma/PostgreSQL, Supabase Auth, ownership checks, template/version management, a visual template editor, private uploads, dynamic PDF generation, atomic correlatives, protected downloads, history, and architecture documentation.

## Architecture

```text
apps/web  ->  apps/api  ->  PostgreSQL
   |             |
   |             +---- Storage provider abstraction
   |
   +---- Shared types and validation packages
```

PostgreSQL is the source of truth for metadata such as templates, versions, elements, generations, users, files, and audit logs. Storage is the source of truth for binary files such as uploaded images and generated PDFs.

## Stack

- Monorepo: pnpm workspaces
- Frontend: React, Vite, TypeScript, Tailwind CSS, shadcn/ui-style components, TanStack Query, Zustand, React Hook Form, Zod
- Backend: NestJS, TypeScript
- Database: PostgreSQL through Prisma
- Storage: Supabase Storage initially, behind a future provider abstraction
- Authentication: Supabase Auth, with NestJS JWT validation and backend ownership checks
- Authorization: PostgreSQL RBAC through roles and permission guards
- PDF: `packages/pdf-engine`, with PDFKit behind an internal interface

## Folder Structure

```text
apps/
  api/                 NestJS API
  web/                 React/Vite app
packages/
  types/               Shared TypeScript types
  validation/          Shared Zod schemas
  pdf-engine/          PDF engine public contract
prisma/                Prisma schema and future migrations
docs/                  Architecture notes
```

## Installation

```powershell
pnpm install
```

Copy `.env.example` to `.env` for local development and replace placeholder values with local credentials. Never commit real credentials.

## Environment Variables

Frontend:

- `VITE_API_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Backend:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `SUPABASE_JWKS_URL`
- `SUPABASE_JWT_AUDIENCE`
- `PORT`
- `CORS_ORIGIN`
- `SUPERADMIN_EMAIL`

`SUPABASE_SERVICE_ROLE_KEY` is a backend-only secret. Never expose it through `VITE_*`, logs, responses, or frontend code. JWT validation uses Supabase JWKS when available, or `SUPABASE_JWT_SECRET` for legacy HS256 projects.

`CORS_ORIGIN` accepts comma-separated frontend origins. For the deployed API on Render, include the Vercel URL, for example `https://web-ggs-e214.vercel.app`; preview wildcards such as `https://*.vercel.app` are also supported.

`SUPERADMIN_EMAIL` is backend-only bootstrap configuration for the first superadmin role assignment. It does not belong in frontend variables.

## Development

Start local PostgreSQL:

```powershell
docker compose up -d postgres
pnpm exec prisma migrate dev
pnpm exec prisma db seed
```

Stop local PostgreSQL:

```powershell
docker compose down
```

Reset the local database volume when you intentionally want a clean development database:

```powershell
docker compose down -v
docker compose up -d postgres
pnpm exec prisma migrate dev
pnpm exec prisma db seed
```

```powershell
pnpm dev
```

This builds the shared packages first, then starts the web and API apps in parallel.

Individual apps:

```powershell
pnpm --filter @ggs/api dev
pnpm --filter @ggs/web dev
```

## Quality Commands

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm build
pnpm verify:phase4
pnpm verify:phase5
pnpm verify:phase6
pnpm verify:phase8
pnpm verify:phase9
```

The Phase 4 example creates disposable Supabase identities, creates a template through HTTP, uploads a synthetic image, generates and downloads a real PDF, verifies ownership and idempotency, and removes all temporary database, storage, and Auth fixtures. It never uses personal documents or prints credentials.

The Phase 5 example creates disposable Supabase identities, saves a visual editor layout with IMAGE, TEXT, RECTANGLE, and LINE elements, reloads persisted coordinates, duplicates the version, verifies ownership, and removes temporary fixtures.

The Phase 6 example creates disposable Supabase identities, uploads synthetic JPEG/PNG/WebP images, verifies private Storage, owner-scoped metadata, signed URLs, invalid-file rejection, safe deletion, audit logs, and cleanup.

The Phase 8 example creates a dynamic template with an image slot and text variable, generates a private PDF, verifies protected download, idempotency, required and unknown slot rejection, and twenty concurrent unique correlatives. It removes all temporary database, Storage, and Auth fixtures.

The Phase 9 example creates real generations for two users, verifies PostgreSQL pagination, search, combined filters, safe sorting, exact-version detail, temporary signed URLs, PDF download, cross-user isolation, safe deletion, audit preservation, and cleanup.

## API Health Check

When the API is running:

```text
GET http://localhost:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "ggs-document-studio-api"
}
```

## Authentication

The frontend uses a single Supabase client for login, registration, OAuth redirect, logout, and session refresh. The API client reads the current Supabase access token and sends it as `Authorization: Bearer <token>` for protected endpoints.

The backend is protected by default through a global AuthGuard. `GET /health` is public. `GET /auth/me`, templates, generations, and files require a valid Supabase access token. User identity is resolved from the verified JWT and synchronized to `users.auth_provider_id`; the frontend is never trusted as the source of `createdById`.

Fase 10 adds database-backed RBAC. `/auth/me` returns safe roles and permissions, the sidebar reflects those permissions, and the API enforces protected actions through `@Permissions(...)`. Fase 11 adds organizations, tenant ownership, organization administration, suspension/activation, and cross-tenant isolation. See `docs/authorization.md` and `docs/multi-tenancy.md`.

## Prisma

The Prisma schema is configured for PostgreSQL. In Prisma 7, the database URL is read from `prisma.config.ts`, while the provider remains in `prisma/schema.prisma`.

```powershell
pnpm prisma validate
```

## Phase Notes

Phase 6 adds the private file library and Storage infrastructure: validated image uploads, backend-generated storage paths, `StoredFile` metadata, owner-scoped list/detail/signed URL/delete endpoints, local and stored previews, audit logs, and cleanup on normal failure paths. Phase 7 adds the independent in-memory PDF engine for IMAGE, TEXT, RECTANGLE, and LINE elements with paper sizes, orientation, coordinates, rotation, image fitting, validation, and deterministic metadata. Phase 8 adds dynamic individual generation, safe variables, atomic correlatives, private PDF output, protected downloads, idempotency, failure compensation, and the `/generate` workflow. Phase 9 adds paginated history, server-side search and filters, exact-version detail, protected downloads, signed URLs on demand, safe deletion and responsive history UX. Phase 10 adds RBAC, users, roles, permissions, dynamic navigation, route 403, and privilege-escalation protections. Phase 11 adds organizations, tenant ownership, organization administration, suspension/activation, and cross-tenant isolation. Bulk generation, queues, billing, collaboration, OCR, and real QR/barcodes remain outside the current scope.
