# Database Model

GGS Document Studio uses PostgreSQL as the source of truth for metadata. Binary file contents are never stored in the database; storage buckets hold uploads and generated PDFs while PostgreSQL stores references and audit metadata.

## Entities

- `User`: application user linked to Supabase Auth through `authProviderId`. Passwords and auth secrets are intentionally not stored.
- `Template`: reusable document template owned by a user.
- `TemplateVersion`: immutable structural version of a template. Generations reference this exact record.
- `TemplateElement`: positioned visual element in PDF points. `IMAGE` elements with a stable `key` act as dynamic image slots.
- `StoredFile`: metadata and storage reference for uploaded images and generated PDFs.
- `Generation`: one PDF generation attempt with a unique human-readable number.
- `GenerationInput`: files or values used by a generation, tied back to the template element that requested them.
- `AuditLog`: minimal audit trail for sensitive business events.
- `GenerationCounter`: PostgreSQL-backed counter row used to allocate generation numbers atomically.

## Local PostgreSQL

Development PostgreSQL runs through Docker Compose:

```powershell
docker compose up -d postgres
pnpm exec prisma migrate dev
pnpm exec prisma db seed
```

The container binds PostgreSQL to `127.0.0.1:5432` only and uses development-only credentials. Stop it with:

```powershell
docker compose down
```

To delete local data and rebuild from migrations:

```powershell
docker compose down -v
docker compose up -d postgres
pnpm exec prisma migrate dev
pnpm exec prisma db seed
```

## Enums

- `TemplateStatus`: `DRAFT`, `ACTIVE`, `ARCHIVED`
- `PaperSize`: `A4`, `A5`, `LETTER`, `LEGAL`, `CUSTOM`
- `Orientation`: `PORTRAIT`, `LANDSCAPE`
- `TemplateElementType`: `IMAGE`, `TEXT`, `RECTANGLE`, `LINE`, plus prepared future types
- `StoredFileType`: `IMAGE`, `PDF`
- `GenerationStatus`: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`
- `AuditAction`: `CREATE`, `UPDATE`, `DELETE`, `DOWNLOAD`, `GENERATE`, `LOGIN`
- `AuditEntityType`: key business entities tracked by audit logs

## Versioning

Templates are containers. Structural layout lives in `TemplateVersion`, and each version owns its `TemplateElement` rows. A generation stores both `templateId` and `templateVersionId`; historical PDFs therefore remain tied to the exact version that produced them even after the template changes.

`UNIQUE(templateId, versionNumber)` guarantees deterministic version numbering inside one template.

The migration also creates a PostgreSQL partial unique index on `template_versions(template_id) WHERE is_active = true`, so a template can have many historical versions but only one active version at a time.

## Image Slots

Image slots are `TemplateElement` rows with `type = IMAGE`, a stable `key`, a human-readable `name`, and JSON `properties`. The frontend must discover slots from the active template version instead of hardcoding fields.

`UNIQUE(templateVersionId, key)` prevents duplicate dynamic keys inside one version while still allowing the same key to exist in another template version.

## Generation Numbers

Generation numbers are allocated through the `generation_counters` table with one atomic PostgreSQL statement:

```sql
INSERT ... ON CONFLICT (key)
DO UPDATE SET current_value = generation_counters.current_value + 1
RETURNING current_value, prefix, padding;
```

PostgreSQL serializes conflicting writes to the same counter row, so concurrent requests cannot receive the same `current_value`. The resulting formatted `Generation.number` and numeric `Generation.sequenceNumber` are both unique.

The initial format is `GGS-000001`. The counter stores `prefix` and `padding` so future formats can be introduced without moving responsibility to the frontend.

## Files

`StoredFile` stores `bucket`, `storageKey`, MIME metadata, size, checksum, optional dimensions, and JSON metadata. The file content itself belongs to private storage. Deleting files referenced by generations or inputs is restricted at the database layer.

## Deletion Policy

The schema favors history preservation:

- User deletion is restricted by templates, generations, and stored files. Users should be deactivated with `isActive = false`.
- Template deletion is restricted by versions and generations.
- Template version deletion is restricted by elements and generations.
- Template element deletion is restricted when generation inputs reference it.
- Stored file deletion is restricted when used as a generation output or input.
- Audit logs use `SetNull` for `userId` so audit history can remain if a user record is removed through an administrative process.

## Indexes And Constraints

Important unique constraints:

- `User.email`
- `User.authProviderId`
- `TemplateVersion(templateId, versionNumber)`
- `TemplateElement(templateVersionId, key)`
- `StoredFile.storageKey`
- `Generation.sequenceNumber`
- `Generation.number`
- `Generation.outputFileId`
- partial unique index: one active `TemplateVersion` per `Template`

Important check constraints:

- positive template version page size
- non-negative margins
- positive template element page number
- non-negative template element geometry
- non-negative stored file size
- positive generation sequence number
- positive counter padding and non-negative counter value

Important indexes:

- user lookup by `email` and `authProviderId`
- templates by `createdById`, `status`, `createdAt`
- template versions by `templateId`, active status, and version number
- template elements by version, type, and key
- generations by number, template, version, creator, status, and creation date
- generation inputs by generation, element, and file
- stored files by creator, type, and creation date
- audit logs by user, entity reference, and creation date
