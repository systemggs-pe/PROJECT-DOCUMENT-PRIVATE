# Storage And Files

## Provider

GGS Document Studio uses Supabase Storage as the first storage provider through the NestJS `StorageService`. Controllers do not call the Supabase SDK directly. The domain flow is:

```text
FilesController
  -> FilesService
  -> StorageService
  -> Supabase Storage
```

The current bucket is read from `STORAGE_BUCKET` and defaults to `ggs-documents`. It must be private.

## Object Paths

The backend generates object paths. Users never provide storage keys or full paths.

```text
users/{userId}/files/{fileId}/original.jpg
users/{userId}/pdf/{generationId}.pdf
```

The original filename is stored only as metadata in PostgreSQL. It is not used as the physical object name.

## StoredFile

`StoredFile` stores metadata only:

- owner: `createdById`
- original display name: `originalName`
- storage location: `bucket`, `storageKey`
- type: `IMAGE` or `PDF`
- MIME type
- size
- image dimensions when known
- checksum
- metadata JSON
- creation time

Binary content is stored in Supabase Storage, not PostgreSQL.

## Upload

`POST /files` accepts one file field named `file`. The current image policy is:

- allowed MIME: `image/jpeg`, `image/png`, `image/webp`
- allowed extensions: `.jpg`, `.jpeg`, `.png`, `.webp`
- max size: 10 MB
- SVG is rejected
- renamed executable or invalid image content is rejected by real image decoding

Accepted images are normalized to JPEG with `sharp`, then uploaded to the private bucket. If database metadata creation fails after upload, the service attempts to remove the uploaded object immediately.

## Access

Files are private by default. The API exposes two owner-scoped access mechanisms:

```text
GET /files/:id/download
GET /files/:id/signed-url
```

Signed URLs expire after 300 seconds. The frontend uses signed URLs for stored-image previews and object URLs for local pre-upload previews.

## Listing And Metadata

`GET /files` supports owner-scoped pagination, search, type filtering, and safe sorting:

```text
GET /files?page=1&pageSize=12&search=dni&type=IMAGE&sortBy=createdAt&sortOrder=desc
```

`GET /files/:id` returns metadata only. Foreign files return 404.

## Delete

`DELETE /files/:id` deletes unused owner-owned images. PDFs are considered historical outputs and cannot be removed through this endpoint. Images referenced by `GenerationInput` are also protected.

The service deletes metadata first so restrictive foreign keys can stop unsafe deletion. Then it removes the storage object. If storage deletion fails after metadata deletion, the object path is logged for future cleanup without exposing secrets.

## Audit

The API writes `AuditLog` records for:

- file upload: `CREATE`
- signed URL or download: `DOWNLOAD`
- file delete: `DELETE`

Audit metadata never includes access tokens, service role keys, or signed URL values.

## Security Notes

`SUPABASE_SERVICE_ROLE_KEY` is backend-only. It must not appear in `apps/web`, browser bundles, logs, responses, or `VITE_*` variables.

Supabase RLS is not the authorization boundary for Prisma API calls. NestJS verifies the JWT and enforces owner-scoped queries before using the service role for Storage operations.

## Future Cleanup

The current system handles normal orphan prevention immediately after upload failures. A later maintenance task can scan Storage paths under `users/*/files/*` and compare them against `StoredFile.storageKey` to report or remove orphaned objects.
