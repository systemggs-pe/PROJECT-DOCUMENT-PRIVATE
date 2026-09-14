# Multi-tenancy

Fase 11 introduces organizations as the tenant boundary. Templates, stored files, generations, and audit logs have a required `organizationId`; users and custom roles may belong to an organization, while system roles remain global.

SUPERADMIN can create, list, update, suspend, and activate organizations. ADMIN manages resources inside the assigned active organization. USER remains restricted to resources created by that user. A suspended organization receives `403` responses from protected API operations until SUPERADMIN activates it again.

The API derives the tenant from the verified local user record. Clients cannot submit `organizationId`, `createdById`, or another user's identity to widen scope. Resource-by-ID queries combine the resource identifier with the tenant/ownership predicate and return `404` for foreign resources. Storage paths are generated server-side under `organizations/<organizationId>/...`.

Run the integration proof against the local API, Supabase Auth, and PostgreSQL with:

```powershell
pnpm verify:phase11
```

The verifier creates disposable users and organizations, tests template and generation isolation, tests suspension/activation, checks the persisted organization and storage key, and removes its fixtures.
