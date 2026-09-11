# GGS Document Studio

GGS Document Studio is a professional document-template platform for creating reusable visual templates, collecting the image inputs required by each template, and generating private PDFs with traceable metadata.

The project is being built in phases. This repository currently contains the Phase 1 foundation: a pnpm TypeScript monorepo, a React frontend, a NestJS API, shared packages, Prisma configuration, and architecture documentation.

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
- Authentication: Supabase Auth in a later phase
- PDF: `packages/pdf-engine`, with PDFKit planned behind an internal interface

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
- `PORT`
- `CORS_ORIGIN`

## Development

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
pnpm build
```

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

## Prisma

The initial Prisma schema is configured for PostgreSQL. In Prisma 7, the database URL is read from `prisma.config.ts`, while the provider remains in `prisma/schema.prisma`. Full data models will be added in Phase 2 after the database design is finalized.

```powershell
pnpm prisma validate
```

## Phase Notes

Phase 1 intentionally does not implement the visual editor, PDF generation, real file uploads, Supabase Auth, storage operations, generation history, audit logging, or correlational numbering. Those capabilities belong to later phases.
