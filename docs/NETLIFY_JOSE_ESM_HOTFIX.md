# Hotfix de carga ESM de jose 6 en Netlify

Fecha: 15 de octubre de 2026. Rama: `deploy/netlify-backend`. Base revisada: `4854dd4`.

**Resultado: corrección local validada.** El ZIP Linux carga y `/api/health` responde 200 con `node --no-experimental-require-module`. No se ha publicado, creado commit ni desplegado este hotfix. La comprobación del despliegue real queda pendiente de autorización; el error reportado de producción no se considera resuelto remotamente hasta ese paso.

## Causa confirmada

El archivo original compilado contenía:

```js
const jose_1 = require("jose");
```

Se reprodujo `ERR_REQUIRE_ESM` cargando ese archivo con Node 24 y `--no-experimental-require-module`. `jose` 6.2.12 es ESM. El Node local con require(ESM) habilitado por defecto ocultaba la incompatibilidad que aparece cuando esa capacidad está deshabilitada.

No basta con escribir `import("jose")` manteniendo `module: "CommonJS"`: TypeScript puede convertirlo en un require diferido. La solución usa `module: "Node16"` y `moduleResolution: "Node16"`, conservando `type: "commonjs"` del paquete y el target ES2022. **Node16 es el modo de emisión/resolución del compilador; el runtime sigue siendo Node 24.** Este modo conserva importación dinámica nativa en archivos CommonJS, conforme a la [documentación de TypeScript](https://www.typescriptlang.org/docs/handbook/modules/reference).

## Corrección

- El verificador carga `jose` mediante un `import("jose")` literal, nativo y diferido. No hay import de valor estático que genere require de jose.
- La promesa de carga se comparte de forma segura y se restablece si falla. Cada servicio conserva su propio resolver JWKS, inicializado una sola vez después de cargar jose y reutilizado en solicitudes concurrentes.
- Las importaciones de tipos usan `resolution-mode: import` y se borran al compilar.
- Se mantiene jose 6.2.12; no se modifica package.json ni el lockfile. No se usa `NODE_OPTIONS=--experimental-require-module` ni se agrega un puente que dependa de copiar archivos en el build.
- Firma, issuer, audience, expiración, extracción de identidad, prioridad de HS256 sobre JWKS cuando hay secreto y rechazo de tokens inválidos conservan su lógica. No se modifican guards, permisos, sincronización de usuarios ni PrismaService.

Se verificó en `dist/modules/auth/services/supabase-jwt-verifier.service.js` y otra vez dentro del ZIP Linux extraído:

```js
return joseModule ??= import("jose").catch((error) => {
    joseModule = undefined;
    throw error;
});
```

El archivo sigue usando `exports.SupabaseJwtVerifierService`; no contiene `require("jose")`. nft incluye jose a partir del import literal; el smoke exige que su resolución esté dentro del ZIP extraído, sin usar node_modules del workspace.

## Archivos modificados

| Archivo | Motivo |
| --- | --- |
| `apps/api/tsconfig.json` | Emisión CommonJS con soporte de import() nativo mediante Node16. |
| `apps/api/src/modules/auth/services/supabase-jwt-verifier.service.ts` | Carga ESM diferida, promesa compartida y conservación del resolver/cache JWKS. |
| `apps/api/src/modules/auth/types/supabase-jwt-claims.ts` | Importación de tipos ESM compatible con el nuevo modo de resolución. |
| `apps/api/src/modules/auth/services/supabase-jwt-verifier.service.spec.ts` | Importación dinámica para firmar fixtures; regresiones de firma, issuer, audience, subject y JWKS con servidor local y concurrencia. |
| `apps/api/src/serverless.spec.ts` | Extensión `.js` en el import dinámico relativo, requerida por resolución Node. No se cambian aserciones. |
| `tools/netlify-validation/run-linux.mjs` | Arranque del artefacto con require(ESM) deshabilitado; modo de PostgreSQL estrictamente de solo lectura para este hotfix. |
| `tools/netlify-validation/artifact-smoke.cjs` | Verificar import nativo compilado y empaquetado, HS256, JWKS/cache y salud del handler bajo la bandera restrictiva, conservando pruebas nativas/PDF/DB. |
| `docs/NETLIFY_JOSE_ESM_HOTFIX.md` | Este informe y comandos reproducibles. |

No se modifican frontend, rutas ni configuración de Netlify, variables/secretos, modelos, migraciones, seed o lógica de conexión PostgreSQL. El archivo no rastreado `df` ya existía al iniciar y se conserva sin modificar.

## Pruebas ejecutadas

Linux x64 en contenedor Debian Bookworm: Node **24.22.0**, pnpm **11.19.0**, jose **6.2.12**, Prisma **7.10.0**, Sharp API **0.35.4**, PDFKit **0.20.2**, Netlify CLI **27.12.1** / Build **37.4.1**. El contenedor `ggs-netlify-jose-hotfix` terminó con código **0**.

| Prueba / comando | Resultado | Alcance |
| --- | --- | --- |
| Carga del JS original con `node --no-experimental-require-module` | FAIL esperado, antes del hotfix | Reproduce exactamente ERR_REQUIRE_ESM de jose. |
| `pnpm --filter @ggs/api typecheck` | PASS | Verificación local Windows. |
| `pnpm --filter @ggs/api build` y `test` | PASS | Build local y 81 pruebas API. |
| `pnpm typecheck` dentro de Linux | PASS | Monorepo completo. |
| `pnpm lint` dentro de Linux | PASS | ESLint de los workspaces. |
| `pnpm test` dentro de Linux | PASS | 117 pruebas: API 81, web 25, pdf-engine 9, types 1 y validation 1. El frontend solo se comprueba; no se modifica. |
| Pruebas JWT del verificador | PASS | HS256 válido; firma, issuer, audience, expiración, subject y email inválidos rechazados. RS256 con JWKS local; ocho verificaciones concurrentes y otra posterior generan una sola petición JWKS. |
| `prisma-pool.integration.spec.ts` en Linux | PASS | 2 pruebas PostgreSQL sin escrituras: transacciones SELECT concurrentes, rollback por error intencional, reutilización, idle timeout y cierre. |
| `pnpm bundle:netlify` en Linux | PASS | Prisma generate, dependencias compartidas, build backend, nft y ZIP nodejs24.x. No usa artefactos Windows ni compila el frontend. |
| Extracción del ZIP fuera del workspace | PASS | El loader, jose, Prisma, Sharp y PDFKit resuelven desde la extracción. |
| `node --no-experimental-require-module tools/netlify-validation/artifact-smoke.cjs <extracción>` | PASS | Proceso explícitamente restrictivo: la función empaquetada carga sin ERR_REQUIRE_ESM; no depende de require(ESM). |
| JWT dentro del artefacto restrictivo | PASS | HS256 válido e inválido; RS256/JWKS con servidor local, ocho verificaciones concurrentes y una sola descarga de claves. |
| `/api/health` del handler empaquetado | PASS | Doce invocaciones concurrentes: 200 y `database: "connected"`; JWT ausente/inválido en rutas protegidas devuelve 401; CORS conserva su origen permitido. |
| Prisma, PostgreSQL, Sharp y PDFKit/fuentes del ZIP | PASS | Consultas reales solo de lectura, decodificación PNG, generación PDFKit con Helvetica y motor PDF. Word sigue rechazado con 400. |
| PostgreSQL solo lectura y cierre | PASS | `transaction_read_only=on` comprobado por Prisma; 0 conexiones de pruebas restantes. Servicio de pruebas detenido al finalizar, volumen conservado. |
| Ocho integraciones originales que escriben fixtures; migrate deploy y seed | SKIP | No se ejecutan en este hotfix para respetar la restricción de no modificar datos PostgreSQL. Sus resultados anteriores no se presentan como ejecuciones nuevas. |
| Supabase real y función desplegada en Netlify/AWS Lambda | BLOCKED | Sin uso de secretos de producción ni despliegue autorizado. No se afirma haber probado remotamente el nuevo código. |
| `git diff --check` y sintaxis de scripts | PASS | Sin errores de whitespace; scripts JS válidos. |

La revisión de cargas directas de todas las dependencias declaradas por `@ggs/api` con `--no-experimental-require-module` encontró ERR_REQUIRE_ESM únicamente en jose, tal como se esperaba para una carga deliberada con require. Las otras 18 dependencias directas cargaron como CommonJS. El AppModule completo y los flujos nativos del ZIP no mostraron otra incompatibilidad ESM. No se afirma cobertura de todas las ramas opcionales de dependencias transitivas.

El mensaje PostgreSQL `division by zero` en el log corresponde al error intencional de la prueba de rollback, no a un fallo de la suite.

## Reproducción sin modificar datos PostgreSQL

Requiere Docker Linux y el volumen de validación aislado existente. No se conecta a producción ni se heredan sus secretos:

```sh
docker compose -f compose.netlify-validation.yml build validator
docker compose -f compose.netlify-validation.yml run --name ggs-netlify-jose-hotfix validator node tools/netlify-validation/run-linux.mjs --read-only-database
```

Para repetir, elegir un nombre de contenedor distinto. El modo `--read-only-database` omite migrate deploy, seed y la suite de ocho pruebas con fixtures; fuerza `default_transaction_read_only=on` en las conexiones. Mantiene las dos pruebas de pool y health contra PostgreSQL real. No ejecutar el runner sin esa opción durante este hotfix.

Evidencia local: `output/netlify-jose-hotfix-linux.log`. Artefacto conservado e ignorado por Git: `.netlify/jose-hotfix-linux-functions/api.zip`, **16.627.869 bytes**, SHA256 `60EB95F25237FE225E0FFD73B8D8BC531148F76836FDF992269D6962B082A80D`. No se desplegó ningún ZIP.

## Alcance de la confirmación y siguiente paso

**Confirmado:** la función compilada y empaquetada en Linux carga bajo la simulación solicitada de Lambda, con require(ESM) deshabilitado; health y las verificaciones criptográficas funcionan sin ERR_REQUIRE_ESM.

**Pendiente:** revisión, autorización de commit/push y nuevo despliegue desde Git. Después, comprobar `/api/health` y autenticación real en Netlify. No cambiar variables de producción ni habilitar experimental-require-module para aplicar esta corrección.

Referencia adicional: [jose y soporte de require(ESM)](https://github.com/panva/jose/blob/main/README.md).
