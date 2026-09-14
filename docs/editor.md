# Visual Template Editor

## Scope

Phase 5 adds a browser-based editor for `TemplateVersion`. It lets an authenticated user open a template version, inspect the paper, add and select elements, move them, resize them, edit properties, preview the document surface, duplicate the version, and save the layout to PostgreSQL.

This phase does not implement new upload, storage, OCR, real QR/barcode generation, bulk generation, collaboration, signing, billing, organizations, or roles.

## Canvas Model

The editor renders a document sheet on a neutral desk. The sheet size is calculated from the version's paper dimensions. The persisted coordinate system is:

```text
origin = top-left
x      = horizontal position in pt
y      = vertical position in pt
width  = element width in pt
height = element height in pt
```

Zoom is visual only. The UI converts `pt -> px` while rendering and converts `px -> pt` after pointer movement or resize. The grid, snapping, and preview mode are also visual/editor state only.

## Supported Elements

- `IMAGE`: a future upload slot. It stores a stable key such as `dni_front`, display name, required flag, fit mode, geometry, rotation, and z-index. The optional border setting is an editor-only guide and is never exported to PDF.
- `TEXT`: stores text content, including future variable placeholders such as `{{cliente_nombre}}`, plus font size, weight, alignment, color, geometry, rotation, and z-index.
- `RECTANGLE`: stores fill, border color, border width, radius, geometry, rotation, and z-index.
- `LINE`: stores stroke color, stroke width, geometry, rotation, and z-index.

Only image slots may store `key`. Keys must be unique within a version.

## Saving

The frontend keeps interactive changes in local React state while the user drags, resizes, edits properties, changes zoom, toggles grid, or uses undo/redo. It does not send an HTTP request for each pointer movement.

Manual save validates the draft and sends one request:

```text
PUT /templates/:templateId/versions/:versionId
```

The API verifies the authenticated owner, validates the full version payload, locks the template row, updates paper settings, replaces version elements, updates the template timestamp, and writes an audit entry in one Prisma transaction.

If a version already has generated documents, layout edits are rejected. The user can duplicate the version and edit the new draft.

## Navigation

The template library routes to:

```text
/templates
/templates/new
/templates/:templateId
/templates/:templateId/versions/:versionId/edit
```

The editor shows breadcrumbs, the version number, and whether the version is active. Leaving with unsaved changes triggers a browser warning where supported.

## Storage Boundary

The editor prepares reusable image slots. Stored files remain separate user-owned records:

```text
Editor
  -> IMAGE slots
  -> Upload
  -> Supabase Storage
  -> StoredFile
```

The future PDF engine phase must interpret `IMAGE`, `TEXT`, `RECTANGLE`, and `LINE` from `TemplateElement` using the same point-based coordinate system and bind generation inputs to `StoredFile` records.
