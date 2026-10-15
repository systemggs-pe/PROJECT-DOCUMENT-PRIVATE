# Cierre de validación previo al primer despliegue

Fecha: 15 de octubre de 2026. Rama local: `deploy/netlify-backend`. No hay push, commits ni despliegue.

Estado final: **PARTIAL**. La validación Linux y PostgreSQL aislado está aprobada. El repositorio está preparado para un primer despliegue de prueba autorizado; faltan Supabase real de pruebas y la aceptación en el runtime administrado de Netlify.

## Evidencia ejecutada

Ejecución final: contenedor `ggs-netlify-validation-run-2`, código de salida **0**. Linux x64, Node **v24.22.0**, pnpm **11.19.0**, PostgreSQL **16.15**, Prisma **7.10.0**, Sharp API **0.35.4**, PDFKit **0.20.2**, Netlify CLI **27.12.1** / Build **37.4.1**.

| Comprobación | Resultado |
| --- | --- |
| Instalación congelada y Prisma Client en Linux | PASS |
| Las 15 migraciones existentes y seed sobre la base de pruebas | PASS; segunda ejecución sin migraciones pendientes |
| TypeScript y ESLint de los workspaces | PASS |
| Tests unitarios | PASS: 115 |
| Ocho integraciones originales de PostgreSQL | PASS: 8, sin modificar sus aserciones |
| Concurrencia y ciclo de vida del pool real | PASS: 2 pruebas |
| Build y empaquetado Netlify sin frontend | PASS |
| ZIP Linux extraído fuera del workspace: dependencias propias, Sharp, Prisma, PDFKit/fuentes, motor PDF y Word desactivado | PASS |
| Doce invocaciones concurrentes del handler extraído con base conectada, rutas protegidas y CORS | PASS |
| Conexiones de pruebas después de finalizar | PASS: 0 clientes restantes, excluyendo la conexión observadora |
| Servicios Supabase reales | BLOCKED: faltan configuración de proyecto de pruebas y tokens A/B |
| Runtime remoto de Netlify/AWS Lambda | No ejecutado: despliegue prohibido en esta fase |

La primera ejecución Linux falló en el smoke por ausencia de `PDFKit/js/standard-fonts/Helvetica.cjs`. Se corrigió `netlify.toml` para incluir fuentes y datos de PDFKit y se repitió la secuencia completa: el resultado final de la segunda ejecución es PASS. El mensaje Prisma `division by zero` del log es el fallo intencional usado para comprobar rollback y recuperación; la prueba pasó.

Evidencia local: `output/netlify-validation-linux.log` (primera ejecución) y `output/netlify-validation-linux-final.log` (segunda). Artefacto Linux conservado, ignorado por Git: `.netlify/linux-functions/api.zip`, **16.627.720 bytes**, SHA256 `F58838E6417D996BE5AB22D95B4D64F1969C362D0E4D6701948819ED6B5EBB6F`. No se desplegó ningún ZIP. PostgreSQL de pruebas quedó detenido y su volumen se conserva; no se eliminó ninguna base.

## Rutas verificadas

Todas las rutas de TOML se resuelven respecto de la raíz del repositorio:

| Campo del panel | Valor | Archivo real |
| --- | --- | --- |
| Base directory | vacío (raíz); TOML `base = "."` | `package.json`, `pnpm-workspace.yaml`, `netlify.toml` |
| Package directory | `apps/api` | `apps/api/package.json` |
| Build command | `pnpm build:netlify` | script del `package.json` raíz |
| Publish directory | `netlify/public` | `netlify/public/index.html` |
| Functions directory | `netlify/functions` | `netlify/functions/api.js` |

Package directory no es Base directory: no configurar la base como `apps/api`, ni duplicar el prefijo al introducir publish/functions. La CLI usa `--filter @ggs/api`; el build sigue ejecutándose desde la raíz. `netlify.toml` está en la raíz, no dentro de `apps/api`. No se cambió ninguna de estas rutas porque coinciden con el monorepo.

La [documentación oficial de monorepos](https://docs.netlify.com/build/configure-builds/monorepos/) confirma que las rutas de configuración se resuelven respecto de la base. La comprobación Linux también valida los paths resueltos por la CLI y que no se haya creado `apps/web/dist/index.html`.

## Linux y PostgreSQL sin servicios externos

Desde la raíz, con Docker Desktop/Engine para contenedores Linux:

```sh
docker compose -f compose.netlify-validation.yml build validator
docker compose -f compose.netlify-validation.yml up -d postgres
docker compose -f compose.netlify-validation.yml run --name ggs-netlify-validation-run validator
```

Si el contenedor de una ejecución anterior conserva ese nombre, usar otro nombre de ejecución (`--name ggs-netlify-validation-run-2`). No reutilizar contenedores de otros proyectos.

El Dockerfile usa Node 24 en Debian Bookworm, instala exactamente pnpm 11.19.0 y las dependencias con lockfile congelado. El contexto excluye node_modules, dist, `.netlify` y `.env*`: no se copia el ZIP de Windows ni credenciales. Toda la instalación, generación Prisma y compilación ocurre en Linux. La red de ejecución es interna y no publica puertos de PostgreSQL. El servicio `postgres` y la base `ggs_netlify_validation` tienen credenciales ficticias exclusivas de este entorno. No se hereda `DATABASE_URL` del host.

El runner comprueba el host/nombre de base antes de ejecutar las migraciones existentes y seed sobre esta base de pruebas. No usa reset, no elimina bases y no modifica migraciones. El historial contiene cambios de esquema que solo se aplican aquí sobre la base aislada; no ejecutar estos comandos contra una base existente de producción.

Secuencia exacta dentro del contenedor:

1. Comprobar Linux, Node 24, pnpm 11.19.0 y URL fija de pruebas.
2. Prisma generate, migrate deploy y seed sobre `postgres/ggs_netlify_validation`.
3. TypeScript, ESLint y tests unitarios de todo el monorepo.
4. Las ocho pruebas existentes de `database.integration.spec.ts`, sin alterar sus aserciones.
5. Dos pruebas de `PrismaService` real: concurrencia, rollback, reutilización, idle timeout y cierre; presupuestos independientes de dos instancias calientes.
6. `netlify build --offline --filter @ggs/api`, sin publicar. Validar paths y manifiesto de la función.
7. Extraer el ZIP Linux en `/tmp`, fuera del workspace. Cargar dependencias desde esa extracción y comprobar Sharp nativo, Prisma, PDFKit/fuentes, motor PDF, rechazo de Word, doce invocaciones concurrentes de health con PostgreSQL real, JWT y CORS.

Para conservar la evidencia local sin desplegar:

```sh
docker logs ggs-netlify-validation-run
docker cp ggs-netlify-validation-run:/workspace/apps/api/.netlify/functions ./.netlify/linux-functions
docker compose -f compose.netlify-validation.yml stop postgres
```

El contenedor de ejecución, la base y su volumen se conservan. En esta sesión el contenedor aprobado es `ggs-netlify-validation-run-2`: sustituir ese nombre en los comandos de logs y copia si se consulta esta ejecución. No usar `down -v`, `volume rm`, `database drop` ni `prisma migrate reset`. Para repetir las ocho pruebas, el seed es idempotente y las fixtures normales se limpian por las propias pruebas. Un fallo intermedio puede dejar fixtures; no borrarlas automáticamente.

Bookworm valida el empaquetado Linux y las dependencias nativas, pero no sustituye la prueba posterior del runtime administrado de Netlify/AWS Lambda, región, TLS remoto o carga real. No usar este ZIP ni el de Windows para publicar en esta fase; cuando se autorice, el sitio de pruebas compilará desde Git en Netlify.

## Servicios Supabase: BLOCKED hasta disponer de un proyecto de pruebas

No se suministraron credenciales de pruebas. No se buscaron ni utilizaron credenciales de producción. El script `tools/netlify-validation/live-services.mjs` se detiene con código 2 antes de enviar solicitudes si falta configuración.

Preparación externa, antes de ejecutarlo:

1. Disponer de un proyecto Supabase exclusivo de pruebas, con Auth y un bucket privado exclusivo. No reutilizar el proyecto ni bucket del sistema actual.
2. Ejecutar una API local o un futuro sitio Netlify de pruebas que apunte a PostgreSQL de pruebas y a ese proyecto/bucket. Configurar en ese backend las variables de la guía de despliegue, manteniendo sus secretos solo en el servidor. Comprobar en su configuración que ninguna URL corresponda a producción.
3. Crear manualmente dos usuarios activos de pruebas y obtener sus access tokens mediante el login de Supabase. Sus roles internos deben ser USER, sin ADMIN/SUPERADMIN, con permisos de plantilla, archivo y generación del seed. No se requiere service role en el script.
4. Proporcionar los valores mediante variables de proceso locales; no guardarlos en Git ni pegarlos en los informes. En PowerShell, `Read-Host -MaskInput` está disponible en PowerShell 7; en Windows PowerShell usar una entrada segura y convertirla únicamente al asignar el entorno, sin imprimirla.

Variables esperadas (los valores siguientes son marcadores, no credenciales):

```text
GGS_TEST_API_URL=https://<sitio-aislado>.netlify.app/api
GGS_TEST_SUPABASE_URL=https://<proyecto-exclusivo-pruebas>.supabase.co
GGS_TEST_TOKEN_A=<access-token-del-usuario-de-pruebas-A>
GGS_TEST_TOKEN_B=<access-token-del-usuario-de-pruebas-B>
GGS_ALLOW_TEST_WRITES=1
```

También se admite una API `http://localhost:<puerto>/api` o su URL local sin prefijo. Con las dependencias instaladas:

```sh
node tools/netlify-validation/live-services.mjs
```

El script comprueba usuarios distintos y el issuer del proyecto Supabase indicado. Valida JWT ausente/inválido/válido, carga/descarga JPG/PNG/WebP/PDF, rechazo de Word/firmas falsas/exceso de 3 MiB, plantilla con imagen/texto/variable, preview con PDF adjunto, generación completa, correlativo, idempotencia y descargas firmadas. También intenta leer, firmar, descargar y eliminar recursos de A con el usuario B y exige su rechazo. Las URLs de descarga deben pertenecer al proyecto de pruebas; el bearer no se envía a Storage.

Las fixtures se conservan con prefijo `Netlify isolated` y el script imprime sus IDs para revisión en el entorno de pruebas. No elimina bases, usuarios ni históricos. No evalúa carga masiva ni simula que el servicio real funciona cuando no hay credenciales.

## Publicar la rama y crear un sitio de prueba: pasos pendientes

Nada de lo siguiente se ha ejecutado. Primero revisar los cambios y autorizar explícitamente commit y push:

1. Revisar `git diff`, los archivos nuevos y los informes. Los cambios de la migración siguen locales y sin commit.
2. Tras autorización, crear un commit en `deploy/netlify-backend` con los archivos revisados y publicar esa rama mediante `git push -u origin deploy/netlify-backend`.
3. Crear un proyecto Netlify nuevo y separado para pruebas, conectado a esa rama, con las rutas de la primera tabla. La confirmación del asistente de importación puede lanzar el primer despliegue y requiere autorización posterior.
4. Usar únicamente variables PostgreSQL/Supabase/bucket de pruebas y Node 24. No importar variables del sitio actual ni cambiar dominios, CORS o `VITE_API_URL` del frontend utilizado por clientes.
5. Tras autorizar el despliegue de prueba, validar health conectado y ejecutar el script de servicios reales contra esa URL. Si se necesita frontend de pruebas, usar una instancia separada con su propio `VITE_API_URL`.
6. Mantener Railway y el frontend actuales sin cambios. Promover o cambiar tráfico es una decisión posterior, fuera de esta validación.
