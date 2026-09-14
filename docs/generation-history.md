# Generation History

The `Generation` table is the source of truth for the authenticated user's history. `GET /generations` returns a light paginated response with template, exact template version, status, output metadata, and timestamps. It never reads PDF buffers or creates signed URLs for list rows.

## Query

```text
GET /generations?page=1&pageSize=20&search=GGS-000001&status=COMPLETED&templateId={uuid}&templateVersionId={uuid}&from=2026-09-01&to=2026-09-30&sort=createdAt&order=desc
```

`pageSize` is limited to 100. Search runs in PostgreSQL against generation number, template name, and generated filename. Status, template, version, UTC date range, and whitelist sorting are validated by Zod before Prisma runs.

## Detail and download

`GET /generations/:id` returns the exact template version used, output metadata, safe input filenames, values, and status. Storage keys are not exposed. `GET /generations/:id/download` authenticates and checks ownership before streaming the private PDF. `GET /generations/:id/signed-url` creates a 300-second signed URL on demand and records the download event.

## Delete policy

There is no soft-delete field in the current schema, so deletion is explicit and physical only for `COMPLETED` or `FAILED` generations. `PENDING` and `PROCESSING` generations are protected. Inputs are removed before the generation, the output `StoredFile` is removed only when it has no other input references, and the private object is then cleaned from Storage. The `DELETE` audit event is retained because audit logs do not cascade with the generation.

## Performance and security

The list uses one transaction for `findMany` plus `count`, bounded pagination, explicit selects, and no N+1 reads. The `(createdById, createdAt)` index supports the primary history query. Every resource lookup derives ownership from the verified JWT user and returns 404 for foreign resources.
