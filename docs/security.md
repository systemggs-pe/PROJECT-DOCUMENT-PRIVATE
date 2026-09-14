# Security

## Authentication

GGS Document Studio uses Supabase Auth for login, registration, logout, OAuth redirects, session storage, access tokens, and refresh tokens. The application does not store passwords, hash passwords, or maintain a parallel session system.

The frontend keeps a single Supabase client in `apps/web/src/lib/supabase.ts`. Session changes are handled through Supabase's auth listener, and the app does not manually persist tokens beyond the official Supabase session mechanism.

## JWT Validation

The NestJS API validates `Authorization: Bearer <access_token>` before protected requests reach controllers. The guard verifies the JWT signature, expiration, audience, issuer when configured, and subject structure. Supabase JWKS is used when asymmetric signing is available; `SUPABASE_JWT_SECRET` supports legacy HS256 projects.

Requests without a token, with malformed headers, with invalid tokens, or with expired tokens return 401 Unauthorized.

## Current User And Sync

After a token is validated, the API extracts the Supabase `sub` as `User.authProviderId`. `UserSyncService` creates or updates the local `User` record with normalized identity fields: email, name, avatar URL, and `lastLoginAt`.

Metadata from the token is not allowed to overwrite critical authorization fields such as local user id, `authProviderId`, or `isActive`.

If the local user exists but `isActive` is false, the API returns 403 Forbidden. The token may be valid, but the local account is not authorized to use protected resources.

## Authorization And Ownership

Authentication answers "who are you?". Authorization answers "can you access this?".

NestJS is the business authorization layer. RBAC is stored in PostgreSQL through `Role`, `Permission`, `UserRole`, and `RolePermission`. Controllers use permission metadata and `PermissionsGuard`; `AuthorizationService` resolves effective permissions from the database. `GET /auth/me` returns only safe identity, roles, and permission keys.

Prisma queries for templates, generations, and stored files continue to filter by the authenticated local user id. Resource-by-ID checks use both `id` and `createdById`. Foreign resources return 404 Not Found so the API does not reveal whether another user's resource exists.

The frontend may hide screens or buttons, but it is never trusted as a security boundary. The API must not accept `userId` or `createdById` from body, query, or route parameters as the authenticated identity.

`SUPERADMIN_EMAIL` is backend-only bootstrap configuration. Changing localStorage, Zustand, route params, or frontend state cannot grant SUPERADMIN.

## Generation History

History filters never accept a user identifier. `GET /generations` derives `createdById` from `CurrentUser`, validates every query value, applies a whitelist for sorting, and limits page size to 100. Detail, download, signed URL, and delete operations repeat the ownership check. Storage keys are selected only after validating the private bucket and backend-generated owner path; list and detail responses expose filenames and metadata, not internal object keys.

Generation deletion is limited to completed or failed records. It removes `GenerationInput` rows before the generation and removes an output `StoredFile` only when no other generation input references it. Audit logs are retained with a `GENERATION_DELETED` event, and Storage cleanup failures are logged without exposing provider errors to the client.

## Service Role

`SUPABASE_SERVICE_ROLE_KEY` is backend-only. It must never be prefixed with `VITE_`, sent to the frontend, returned in API responses, logged, or committed to Git.

Storage operations use the service role only after NestJS has verified the authenticated owner. The service role is not treated as authorization by itself.

## CORS

CORS origins are read from `CORS_ORIGIN`. In development, additional `localhost` and `127.0.0.1` ports are accepted so Vite can safely fall back when its default port is busy; production continues to allow only configured origins. Credentials are enabled only for allowed origins.

## Templates And Versions

Template and version endpoints use the authenticated local user as the ownership boundary. Version numbering, activation, and editor saves are serialized in PostgreSQL transactions. `PUT /templates/:templateId/versions/:versionId` verifies ownership through the parent template, validates the full element payload, rejects non-image keys, rejects duplicate image keys, and does not accept arbitrary `templateId`, `createdById`, or user ids from the body.

A generation keeps its exact version and snapshot; restrictive foreign keys and database triggers prevent historical versions and elements from being changed or removed after use. The editor API also rejects layout edits once a version has generated documents, so the safe workflow is to duplicate the version and edit the new draft.

## Files And Storage

Uploaded images are decoded with `sharp`, restricted to JPEG, PNG, and WebP inputs up to 10 MB, and normalized to JPEG before storage. SVG, unsupported MIME types, unsupported extensions, animated or damaged inputs, and renamed non-images are rejected before metadata is persisted.

Storage object paths are generated by the backend as `users/{userId}/files/{fileId}/original.jpg`. The user-provided filename is stored as sanitized metadata only. File list, metadata, signed URL, download, and delete operations all filter by `StoredFile.createdById`; foreign resources return 404.

The bucket must be private. The frontend receives only short-lived signed URLs for previews. Audit logs record upload, signed URL/download, and delete events without storing signed URL values or secrets.

## Errors

The global exception filter returns sanitized error payloads. It does not expose stack traces, SQL, connection strings, JWTs, Supabase service role keys, or internal secrets to clients.

## RLS

Supabase Auth does not automatically protect Prisma queries made by NestJS. In this architecture, NestJS performs business authorization before querying PostgreSQL. Row Level Security can be added later if direct database access patterns or Supabase Storage policies require it.
