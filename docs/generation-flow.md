# Generation Flow

Fase 8 implements the individual generation path:

```text
CurrentUser -> active TemplateVersion -> IMAGE slots and owned StoredFiles
  -> safe TEXT replacement -> PdfService/PdfEngine buffers
  -> PostgreSQL counter and PROCESSING Generation -> private Storage PDF
  -> PDF StoredFile + COMPLETED Generation + GenerationInput + AuditLog
```

`POST /generations` accepts an explicit `templateVersionId` or a `templateId`, plus `inputs` as an array or a dynamic object whose values are `{ storedFileId }`. Variables are plain strings and replace only `{{ variable_name }}` tokens. Unknown slots, missing required slots, foreign files, inactive templates, and unsafe storage keys are rejected before numbering.

The counter is allocated with `GenerationNumberService.next()` inside the PostgreSQL reservation transaction. A user-row lock plus the unique `(createdById, requestKey)` constraint makes retries deterministic. If Storage fails after reservation, the generated object is removed when possible and the generation is marked `FAILED` without exposing provider details.

Completed documents are downloaded through `GET /generations/:id/download`. The route verifies owner, status, PDF type, private bucket, and the backend-generated `users/{userId}/generated/{generationId}.pdf` path before reading Storage. The frontend `/generate` screen derives image slots and text variables from the selected version and keeps the request key stable during retries.

Run the disposable real integration check with:

```powershell
pnpm verify:phase8
```

It requires local PostgreSQL, the local Supabase Auth/Storage service, and configured local environment variables. The script creates synthetic identities and a one-pixel fixture, then removes its database, Storage, and Auth data.
