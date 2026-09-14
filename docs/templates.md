# Templates And Versions

## Template

A template is an owned document definition. Its metadata includes `name`, `description`, `status`, creation time, and update time. The API always derives ownership from the authenticated Supabase identity and never accepts `createdById` from the client.

## Version

Every template starts with version 1. A version stores the paper size, orientation, dimensions, margins, page count, and its elements. New versions receive their number inside a PostgreSQL transaction while the template row is locked, so concurrent requests cannot create the same number.

The current application keeps one active version per template. New versions are drafts. Activating a version is an explicit operation that first deactivates the current version and then activates the selected one. PostgreSQL's partial unique index is the final protection against two active versions.

The visual editor edits one `TemplateVersion` at a time. Saving a version updates that exact version and replaces its elements inside one transaction. If a version already has generated documents, the API rejects layout edits and the user must duplicate it before making changes. This protects historical PDFs.

## Coordinates And Units

Template elements use document points (`pt`) as the source of truth. The origin is the top-left corner of the page:

```text
(0,0) ----> x
  |
  v
  y
```

The editor canvas converts points to screen pixels only for display. Zoom, grid, device pixel ratio, and browser viewport size do not change persisted coordinates. Paper dimensions are stored in points, for example A4 portrait is `595.28 x 841.89`.

## Element Types

The editor currently accepts these persisted element types:

- `IMAGE`: image slot with stable `key`, label, required flag, fit mode, geometry, and rotation. Legacy border settings are retained for editor compatibility but are never rendered in generated PDFs.
- `TEXT`: static or future dynamic text. Content such as `{{cliente_nombre}}` is stored but not resolved by the editor.
- `RECTANGLE`: simple shape with fill, stroke, stroke width, radius, geometry, and z-index.
- `LINE`: simple line represented by width, height, stroke color, and stroke width.

Only `IMAGE` elements may have a `key`. Image keys are unique inside a version and are intended for future dynamic input forms.

## Ownership And States

All template and version reads and mutations filter by the authenticated local user. Missing and foreign resources return 404. Templates can be `DRAFT`, `ACTIVE`, or `ARCHIVED`; archiving is explicit, and restore returns the template to `ACTIVE`. An archived template cannot create or activate versions until it is restored.

## History

A generation references the exact `TemplateVersion` used to create its PDF. Used versions and elements are protected by restrictive foreign keys and database triggers, so editing or deleting them cannot mutate historical documents. The application archives templates instead of physically deleting records with history.

## API

```text
GET    /templates?page=1&pageSize=20&search=DNI&status=ACTIVE&sortBy=updatedAt&sortOrder=desc
POST   /templates
GET    /templates/:id
PATCH  /templates/:id
PUT    /templates/:id                         # Save a complete new layout version
POST   /templates/:id/archive
POST   /templates/:id/restore

GET    /templates/:id/versions
POST   /templates/:id/versions
GET    /templates/:id/versions/:versionId
PUT    /templates/:id/versions/:versionId       # Save this version's paper settings and elements
POST   /templates/:id/versions/:versionId/activate
POST   /templates/:id/versions/:versionId/duplicate
```

Image slots describe required inputs, while real files live in `StoredFile` and private Storage. See `docs/editor.md` for the editor flow and canvas behavior. See `docs/storage.md` for upload, preview, signed URL, and delete rules. The independent renderer contract, coordinate conversion, supported elements, limits, and validation errors are documented in `docs/pdf-engine.md`.
