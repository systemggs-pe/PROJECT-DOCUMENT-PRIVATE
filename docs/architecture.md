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

The frontend never accesses PostgreSQL directly. Sensitive operations pass through the NestJS API, where authentication, authorization, validation, and auditing will be enforced.

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

## Phase 1 Boundary

The current implementation provides only the foundational project structure, health check, shared packages, Prisma bootstrap, and initial UI shell. Database models, authentication, storage, and PDF rendering are intentionally deferred to later phases.
