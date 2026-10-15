# Informe de migración del backend a Netlify

Fecha: 15 de octubre de 2026. Estado final: **PARTIAL**.

Actualización de cierre: Linux y PostgreSQL aislado ya están validados. Ver [evidencias, comandos reproducibles y pasos pendientes](NETLIFY_PREDEPLOY_CHECKS.md). El bloqueo restante corresponde a Supabase de pruebas y al runtime remoto, cuyo despliegue no está autorizado todavía.

## A. Archivos modificados

La tabla al final enumera todos los archivos modificados o nuevos y su motivo. No se modifica el modelo Prisma, migraciones, seed, diseño/CSS ni configuración de despliegue del frontend.

## B. Cambios implementados

- Entrada Lambda independiente mediante serverless-http y Nest inicializado una sola vez por instancia, sin listen; arranque tradicional conservado.
- Configuración compartida de filtros, pipes y CORS. La función aplica CORS de producción con los orígenes configurados explícitamente.
- Build exclusivo de API y dependencias workspace, Prisma generate y empaquetado nft; Node.js 24, pnpm 11.19.0, publish mínimo y rewrites `/api/*` y rutas originales.
- Pool pg acotado a dos conexiones por instancia por defecto, timeouts y reutilización. Se conservan transacciones, bloqueos y correlativos.
- Carga multipart con un archivo de hasta 3 MiB, campos de texto acotados y validación de formatos, firma, imagen, permisos y metadata. Se conserva la limpieza compensatoria existente.
- Rechazo de Word nuevo y conversión histórica con mensaje claro. Los originales históricos siguen disponibles; se rechazan para nuevas generaciones antes de reservar número. No se elimina información.
- URLs firmadas existentes para descargas. `/download` autoriza y redirige; el frontend solicita `/signed-url` y descarga directamente sin propagar su bearer a Storage.
- Las vistas previas pequeñas conservan respuesta PDF binaria. Una respuesta serializada que exceda 6.000.000 bytes devuelve 413 controlado en la función.

## C. Comandos y resultados

En este equipo se utilizó `npx --yes pnpm@11.19.0` porque `pnpm` no estaba instalado globalmente. Los comandos de la tabla omiten ese prefijo por brevedad.

| Verificación / comando ejecutado | Resultado final | Evidencia y alcance |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | PASS | Instalación inicial y posterior a incorporar CLI. Se corrigió la aprobación de scripts de netlify-cli y se deshabilitó unix-dgram opcional en allowBuilds. |
| `pnpm db:generate` | PASS | Prisma Client 7.10.0 generado; también ejecutado por typecheck, test y build. Sin conexión ni migración de base. |
| `pnpm typecheck` | PASS | Todos los workspaces. Se corrigieron durante la implementación los tipos iniciales del adaptador y un import de opciones MIME. |
| `pnpm lint` | PASS | Todos los workspaces después de los cambios de código. Se corrigieron importaciones de tipos en la nueva prueba. |
| `pnpm test` | PASS | Suite completa final en Linux: 115 pruebas. API 79, web 25, motor PDF 9, types 1, validation 1. |
| `pnpm --filter @ggs/web test` | PASS | Reejecución tras añadir dos regresiones adicionales de descarga: 25 pruebas web; total combinado final 115. |
| `pnpm --filter @ggs/web typecheck` y `lint` | PASS | Comprobación del último cambio de pruebas web. |
| `pnpm test:integration` | PASS | Las ocho pruebas originales pasan contra PostgreSQL 16.15 aislado. El fallo inicial por falta de servidor quedó resuelto; no se alteraron las pruebas. |
| `vitest run src/common/database/prisma-pool.integration.spec.ts` dentro del entorno aislado | PASS | Dos pruebas con PrismaService real: 20 transacciones concurrentes, rollback, reutilización, idle timeout, cierre y dos instancias simultáneas. Cero conexiones restantes al terminar la validación. |
| `pnpm build:netlify` | PASS | Prisma generate, types, pdf-engine y API; no se ejecuta el build de React. |
| `pnpm bundle:netlify` | PASS | Linux: Netlify CLI 27.12.1 / Build 37.4.1; ZIP de 16.627.720 bytes, nodejs24.x, nft. Se corrigió la omisión de fuentes PDFKit descubierta al probar la primera extracción. |
| `netlify functions:build` y build inicial con esbuild | FAIL; sustituidos | El subcomando no aplicaba la configuración completa; esbuild fallaba con EISDIR al recorrer exports de Sharp/PDFKit/Prisma. La configuración final usa build completo y nft. |
| `pnpm dev:netlify --offline --no-open --skip-gitignore` | PASS | API cargada; HTTP local en puerto 8888. Proceso detenido al terminar las comprobaciones. |
| HTTP GET `/health`, `/api/health`, `/.netlify/functions/api/health` con fetch real | PASS | 200; `database=not_configured`. Variables Supabase ficticias y DATABASE_URL vacía; esto no certifica conexiones externas. |
| HTTP GET `/api/auth/me`, `/api/files`, `/api/generations` sin JWT | PASS | 401 mediante Netlify Dev real. |
| HTTP OPTIONS `/api/files` | PASS | Origin permitido: 204 y cabecera correspondiente. Origin desconocido: sin cabecera CORS (404 en el preflight local). |
| `node dist/main.js` con PORT=3002 y GET `/health` | PASS | Arranque tradicional verificado con base sin configurar. Proceso detenido. |
| `git diff --check` | PASS | Sin errores de whitespace después de corregir los finales de archivo. |
| Arranque aislado del ZIP Linux fuera del repositorio | PASS | Instalación y empaquetado nuevos en Linux; Sharp, Prisma, PDFKit/fuentes y motor PDF cargan desde la extracción. Doce health concurrentes con PostgreSQL conectado; JWT inválido/ausente rechazado y CORS correcto. No se utilizó el ZIP de Windows. |
| Runtime remoto Netlify/AWS Lambda | No ejecutado | Requiere el primer despliegue de pruebas, prohibido en esta fase. Linux Bookworm no sustituye esa aceptación. |
| JWT válido + sincronización de usuario y roles contra Supabase real | BLOCKED | Faltan URL del proyecto Supabase de pruebas y tokens de dos usuarios. PostgreSQL aislado ya está validado. |
| Upload, descarga, generación, auditoría y permisos entre usuarios de extremo a extremo con PostgreSQL/Supabase | BLOCKED | Preparado `tools/netlify-validation/live-services.mjs` con instrucciones exactas. Su preflight se ejecutó y se detuvo sin enviar peticiones por falta de variables; no se simula aprobación externa. |

Las pruebas de regresión del adaptador usan Nest y el router reales. Cubren reintento del arranque, inicialización concurrente, rutas, JWT ausente/inválido, CORS, base64 multipart de 3 MiB y rechazo de exceso, PDF binario, preview grande y redirección de descarga. Para las peticiones de upload/preview/descarga positivas se usan guards y servicios sustituidos por dobles: prueban el transporte, no Storage ni la base. Las pruebas existentes de servicios cubren aislamiento, compensación, idempotencia y permisos con dobles. Las pruebas frontend verifican que el bearer va solo a la API, conservando nombre y acción de descarga.

Las expectativas de Word en cuatro archivos de pruebas existentes cambiaron porque el requisito elimina explícitamente esa funcionalidad; CORS también exige ahora configuración explícita en producción. No se eliminaron pruebas de autorización ni se relajaron aserciones para ocultar fallos.

## D. Compatibilidad

Conservados: plantillas, versiones, elementos, texto, imágenes, variables, motor PDF, adjuntos PDF, preview dentro del límite, correlativos, historial, usuarios, roles, permisos, JWT, auditoría y almacenamiento. No se modifica su implementación funcional salvo los puntos indicados.

Desactivados deliberadamente: cargas DOC/DOCX y conversión mediante LibreOffice. Los formatos nuevos permitidos son JPG/JPEG, PNG, WebP y PDF. Límite: 3 × 1024 × 1024 bytes por original y por imagen normalizada. Los límites históricos del motor para generaciones no se reducen a 3 MiB.

Linux, el artefacto aislado y el pool PostgreSQL directo ya están validados. Pendiente: runtime administrado de Netlify, TLS/pooler remoto, Supabase, rendimiento con documentos reales y extremo a extremo con dos usuarios. Las plantillas o campos históricos exclusivos de Word necesitan una edición explícita para aceptar PDF.

## E. Netlify

| Campo | Valor exacto |
| --- | --- |
| Base | raíz, vacío en UI / `.` en TOML |
| Package directory | `apps/api` |
| Build | `pnpm build:netlify` |
| Publish | `netlify/public` |
| Functions | `netlify/functions` |
| Node / pnpm | `24` / `11.19.0` |
| Bundler | `nft` |
| API del frontend | `VITE_API_URL=https://<proyecto>.netlify.app/api`, sin barra final |

La [guía de despliegue](NETLIFY_BACKEND_DEPLOY.md) contiene las variables, instrucciones del panel, pruebas posteriores y rollback. La rama es local: la revisión todavía no puede seleccionarse desde GitHub.

## F. Riesgos

Funciones síncronas: 60 s, memoria predeterminada 1024 MB y buffered payload 6 MB; binario útil aproximado 4,5 MB. Confirmado en la [documentación oficial de Netlify](https://docs.netlify.com/build/functions/configuration/). Las cargas de 3 MiB quedan dentro del presupuesto; las descargas van a Storage. Preview grande devuelve 413. Carga real y consumo de memoria no medidos en Linux.

Cada instancia abre su propio pool. El tamaño dos no limita la suma de todas las instancias: dimensionar concurrencia o utilizar un pooler externo compatible. Un timeout después de reservar puede dejar PROCESSING; los cortes duros no ejecutan necesariamente compensaciones. Se documenta una evolución asíncrona durable si las mediciones la justifican, sin introducir ahora una cola ni modificar modelos.

El ZIP de Windows no se debe desplegar como artefacto Linux. Se validó un nuevo ZIP Linux y se conserva localmente sin publicar. El futuro sitio debe volver a construir desde Git; la aceptación del runtime remoto y de los servicios externos son condiciones previas al cambio de tráfico.

## G. Estado final

**PARTIAL**: instalación/build Linux, 115 pruebas unitarias, ocho integraciones PostgreSQL, dos pruebas del pool y smoke del ZIP aislado aprobados. Preparado para el primer despliegue de prueba cuando se autorice. No READY para producción: faltan Supabase real de pruebas, rendimiento y runtime administrado. Los pasos de publicación de la rama están documentados y no se han ejecutado.

## H. Git y acciones externas

Rama: `deploy/netlify-backend`, creada desde `main`; árbol inicial de la migración limpio. El cierre conservó todos los cambios locales previos. Archivos modificados y nuevos permanecen sin commit ni staging. No se hizo push, despliegue ni cambio de producción. Las migraciones y seed existentes se ejecutaron solo sobre la nueva base aislada de pruebas; PostgreSQL quedó detenido y se conserva el volumen, sin eliminar bases. No se modificó schema, SQL, seed ni las ocho pruebas originales.

Los artefactos `.netlify`, dist y node_modules están ignorados. La revisión automática rechazó por política de ejecución la limpieza de dos carpetas temporales creadas al intentar extraer el ZIP fuera del repositorio; se dejaron sin borrar. Esto no afecta los archivos del proyecto.

## Lista completa de archivos

46 archivos modificados o nuevos en la migración y su cierre de validación.

| Archivo | Motivo |
| --- | --- |
| `.env.example` | Variables ficticias actualizadas, pool configurable y retiro de opciones LibreOffice. |
| `.gitignore` | Ignorar artefactos locales .netlify. |
| `apps/api/package.json` | Dependencia serverless-http. |
| `apps/api/src/bootstrap.ts` | Inicializacion compartida de Nest, validacion, errores y CORS. |
| `apps/api/src/common/database/prisma.service.ts` | Pool acotado, timeouts y manejo de errores ociosos sin credenciales. |
| `apps/api/src/cors.spec.ts` | Regresion de la politica explicita de produccion. |
| `apps/api/src/cors.ts` | Orígenes de producción solo desde configuración explícita. |
| `apps/api/src/main.ts` | Reutilizar bootstrap conservando listen local. |
| `apps/api/src/modules/document-conversion/document-conversion.service.ts` | Desactivar LibreOffice y devolver error controlado para Word. |
| `apps/api/src/modules/file-fields/dto/index.ts` | Restringir nuevos campos a formatos soportados y 3 MiB. |
| `apps/api/src/modules/files/files.controller.ts` | Multipart de 3 MiB y descarga autorizada por redireccion firmada. |
| `apps/api/src/modules/files/files.service.spec.ts` | Regresion de 3 MiB y Word sin escrituras adicionales. |
| `apps/api/src/modules/files/files.service.ts` | Rechazar Word, limitar originales e imagen normalizada; conservar seguridad y metadata. |
| `apps/api/src/modules/generations/generation-runner.service.spec.ts` | Verificar rechazo temprano sin escritura ni conversion. |
| `apps/api/src/modules/generations/generation-runner.service.ts` | Rechazar Word historico antes del render y de reservar correlativo. |
| `apps/api/src/modules/generations/generations.controller.ts` | Descarga via URL firmada sin devolver PDFs grandes por Functions. |
| `apps/api/src/modules/templates/template-input.ts` | Nuevas reglas de adjuntos PDF y 3 MiB. |
| `apps/api/src/serverless.spec.ts` | Regresiones del adaptador, HTTP, multipart, binario, descargas y presupuesto de conexiones. |
| `apps/api/src/serverless.ts` | Handler Lambda reutilizable, rutas y transporte binario con limite de respuesta. |
| `apps/web/src/features/admin/FileFieldsPage.tsx` | Opciones de formatos soportados y tamanos 1 a 3 MiB; mismo formulario. |
| `apps/web/src/features/file-fields/file-field-model.ts` | Retirar Word de opciones de nuevos archivos. |
| `apps/web/src/features/files/FileLibrary.test.ts` | Expectativas de PDF/Word y rechazo sobre 3 MiB. |
| `apps/web/src/features/files/FileLibrary.tsx` | Selector y mensajes de formatos y limite nuevos; mismo diseno. |
| `apps/web/src/features/files/file-model.ts` | Validacion frontend consistente con API y mensaje claro de Word. |
| `apps/web/src/features/generation/GeneratePage.tsx` | Aplicar limite en cargas de generacion y selector de adjuntos PDF. |
| `apps/web/src/features/studio/Editor.tsx` | Ajustar opciones de archivos PDF y limite del editor existente. |
| `apps/web/src/features/studio/model.ts` | Valores iniciales y normalizacion de reglas de archivos soportados. |
| `apps/web/src/lib/api.test.ts` | Regresiones de descarga y ausencia de bearer en la peticion a Storage. |
| `apps/web/src/lib/api.ts` | Descarga directa de URLs firmadas, sin bearer en Storage. |
| `docs/NETLIFY_BACKEND_AUDIT.md` | Hallazgos, compatibilidad e inventario de 51 rutas con sus permisos. |
| `docs/NETLIFY_BACKEND_DEPLOY.md` | Configuracion exacta, variables, PostgreSQL, pruebas, limites y rollback. |
| `docs/NETLIFY_BACKEND_VALIDATION.md` | Resultados ejecutados, bloqueos y reporte A-H con archivos. |
| `netlify.toml` | Configuración backend, rutas, nft y recursos dinámicos de fuentes/datos de PDFKit detectados en el smoke Linux. |
| `netlify/functions/api.js` | Entrada CJS que consume salida compilada de Nest. |
| `netlify/public/index.html` | Directorio publish minimo sin React. |
| `package.json` | Scripts de build exclusivo, bundling y desarrollo Netlify; CLI de desarrollo. |
| `pnpm-lock.yaml` | Resolucion reproducible de serverless-http y Netlify CLI, con sus dependencias. |
| `pnpm-workspace.yaml` | Permitir postinstall de CLI y deshabilitar unix-dgram opcional. |
| `apps/api/src/common/database/prisma-pool.integration.spec.ts` | Dos pruebas reales de concurrencia, rollback, reutilización, inactividad y cierre sobre PostgreSQL aislado. |
| `compose.netlify-validation.yml` | PostgreSQL y runner Linux en red interna sin puertos publicados; volumen conservado. |
| `docs/NETLIFY_PREDEPLOY_CHECKS.md` | Cierre de validación, evidencia Linux, comandos de servicios reales y pasos pendientes de publicación. |
| `tools/netlify-validation/Dockerfile` | Instalación Linux reproducible con Node 24 y pnpm 11.19.0. |
| `tools/netlify-validation/Dockerfile.dockerignore` | Excluir dependencias/artefactos Windows y archivos de entorno del contexto. |
| `tools/netlify-validation/run-linux.mjs` | Secuencia protegida de migraciones/seed solo de pruebas, verificaciones, build y smoke aislado. |
| `tools/netlify-validation/artifact-smoke.cjs` | Cargar dependencias propias del ZIP Linux y verificar PDF, imágenes, DB, CORS y guards sin LibreOffice. |
| `tools/netlify-validation/live-services.mjs` | Pruebas preparadas para Supabase de pruebas, generación, Storage e aislamiento entre dos usuarios; preflight BLOCKED sin variables. |
