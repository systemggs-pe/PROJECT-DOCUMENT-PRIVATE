# Despliegue del backend Document Studio GGS en Netlify

Actualizado el 15 de octubre de 2026. Estado de aceptación: **PARTIAL** hasta validar Supabase de pruebas y el runtime administrado de Netlify. PostgreSQL y el build se comprueban ahora en Linux aislado; ver [cierre predespliegue](NETLIFY_PREDEPLOY_CHECKS.md). No se ha desplegado, hecho push ni creado commits.

## Arquitectura final

React/Vite permanece en su alojamiento independiente. Netlify publica únicamente `netlify/public` y la función `api`. Los rewrites llevan `/api/*` y las rutas originales a esa función. `serverless-http` adapta Express; Nest reutiliza `AppModule`, servicios, pipes, filtros y guards. `apps/api/src/main.ts` conserva `listen()` para desarrollo tradicional. La función utiliza `app.init()` y comparte una promesa de inicialización por instancia; un arranque fallido permite reintentar. No hay trabajo de generación que continúe después de devolver la respuesta.

`tsc` conserva la metadata de decoradores de Nest. El empaquetador `nft` de Netlify incluye módulos y recursos sin volver a transpilar Nest. Se eligió después de reproducir un fallo `EISDIR` del recorrido de dependencias externas con esbuild. `included_files` incluye explícitamente Prisma generado y los recursos `standard-fonts` y `data` de PDFKit: la prueba Linux detectó que faltaba `Helvetica.cjs` sin esa configuración. El despliegue futuro debe construir desde Git en Linux, con dependencias opcionales habilitadas; no subir el ZIP de Windows.

La conexión sigue siendo PostgreSQL externo con Prisma 7, `PrismaPg` y `pg.Pool`. Storage y Auth siguen siendo Supabase. No se cambian modelos ni se ejecutan migraciones durante el build.

## Configuración exacta del panel

Cuando se autorice el despliegue:

1. En Netlify, elegir **Add new project → Import an existing project → GitHub**, autorizar el repositorio privado `PROJECT-DOCUMENT-PRIVATE` y seleccionarlo.
2. La rama local `deploy/netlify-backend` todavía no está en GitHub. Publicar los cambios requerirá autorización posterior; hasta entonces el panel no podrá seleccionar esa revisión. No elegir `main` esperando que contenga estos cambios.
3. Elegir la rama que contenga esta migración y configurar lo siguiente. Si hay autodetección de Vite, sustituir sus valores por los de esta tabla.
4. Añadir las variables antes de iniciar el primer build. La acción final del asistente de importación puede lanzar un despliegue: completarla solo después de la autorización.

| Campo | Valor |
| --- | --- |
| Base directory | raíz del repositorio; dejar vacío en el panel (`base = "."` en TOML) |
| Package directory | `apps/api` |
| Build command | `pnpm build:netlify` |
| Publish directory | `netlify/public` |
| Functions directory | `netlify/functions` |
| Node.js | `24` |
| pnpm | `11.19.0` |
| Instalación | pnpm detectado por `packageManager` y `pnpm-lock.yaml`; `PNPM_FLAGS=--prod=false --frozen-lockfile` |
| Bundler de Functions | `nft`, definido en `netlify.toml` |

El build ejecuta Prisma generate, después `@ggs/types`, `@ggs/pdf-engine` y `@ggs/api`. No compila `apps/web`. Instala también dependencias de desarrollo para disponer de TypeScript y Prisma CLI aunque `NODE_ENV=production`.

## Variables del backend

Configurar las variables de ejecución en **Project configuration → Environment variables**, con ámbito **Functions** y el contexto de despliegue correspondiente. `netlify.toml` configura el entorno de build; no sustituye la configuración de secretos para Functions. Usar valores distintos para previews y producción. No añadir secretos a `VITE_*` ni a TOML.

| Variable | Valor o requisito |
| --- | --- |
| `DATABASE_URL` | URL externa pública de PostgreSQL, preferiblemente pooler transaccional; TLS con verificación de certificado, por ejemplo `sslmode=verify-full` y CA válida para el proveedor |
| `DATABASE_POOL_MAX` | `2` inicialmente; entero entre 1 y 10, por instancia caliente |
| `SUPABASE_URL` | URL real del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Secreto del servidor; nunca incluirlo en el frontend |
| `SUPABASE_JWT_SECRET` | Solo para firma HS256 heredada; dejar sin definir si se utiliza JWKS |
| `SUPABASE_JWKS_URL` | URL de JWKS para firma asimétrica; si no se define y hay SUPABASE_URL, se deriva `/auth/v1/.well-known/jwks.json` |
| `SUPABASE_JWT_AUDIENCE` | `authenticated`, salvo configuración explícita distinta del proyecto |
| `STORAGE_BUCKET` | Bucket privado existente, por ejemplo `ggs-documents` |
| `CORS_ORIGIN` | Orígenes exactos del frontend separados por comas, por ejemplo `https://studio.example.com`; incluir esquema y puerto cuando corresponda |
| `SUPERADMIN_EMAIL` | Email real autorizado para bootstrap; conservar el valor del backend anterior |
| `DEFAULT_ORGANIZATION_SLUG` | Slug de la organización existente; conservar el valor anterior |
| `NODE_ENV` | `production` en Functions; el adaptador aplica CORS de producción incluso si esta variable falta |
| `AWS_LAMBDA_JS_RUNTIME` | `nodejs24.x`, opcional para fijarlo explícitamente en el panel; no se define en TOML |

`DATABASE_URL` no es necesaria para generar Prisma Client, porque `prisma.config.ts` ya tiene un fallback de desarrollo y el build no abre la base. No configurar `SHADOW_DATABASE_URL` para Functions ni ejecutar `migrate dev` o seeds en producción. `PORT` se usa solo en el servidor tradicional. Se eliminan de `.env.example` `LIBREOFFICE_BIN` y `DOCUMENT_CONVERSION_TIMEOUT_MS`, ya sin efecto.

Supabase Storage debe seguir siendo privado. Conservar las políticas existentes; las URLs firmadas se crean únicamente después de autorización y auditoría. La service role queda dentro de la API. Revisar que el bucket admita los tipos y tamaños usados: los originales nuevos están limitados a 3 MiB, pero un PDF generado puede sumar varios adjuntos y ser mayor.

## PostgreSQL y conexiones

Netlify no aporta automáticamente la base PostgreSQL de esta aplicación. Mantener la base existente o una base de pruebas equivalente; no cambiar proveedor ni datos para esta migración. Una URL privada `*.railway.internal` no es accesible desde Netlify: utilizar el endpoint público TLS o el pooler del proveedor.

El pool por instancia tiene `max=2`, espera de conexión de 5 s, liberación de conexiones ociosas a los 10 s y `allowExitOnIdle`. Se reutiliza con Nest y no se desconecta después de cada petición. Los errores de conexiones ociosas se registran sin incluir credenciales. `onModuleDestroy` conserva el cierre para herramientas y procesos locales.

Con N instancias simultáneas, prever hasta `N × DATABASE_POOL_MAX` conexiones, más migraciones y otros clientes. Limitar la concurrencia según el presupuesto de la base o configurar un pooler externo compatible con transacciones Prisma. Un pooler no convierte los locks transaccionales en locks de sesión: se mantienen las transacciones y bloqueos actuales. Verificar el comportamiento contra el proveedor real antes de producción. Para certificados privados, proporcionar la CA mediante un mecanismo soportado por pg y el proveedor; no desactivar la verificación TLS.

## Pruebas locales reproducibles

Desde la raíz y con Node.js 24:

```sh
npx --yes pnpm@11.19.0 install --frozen-lockfile
npx --yes pnpm@11.19.0 typecheck
npx --yes pnpm@11.19.0 lint
npx --yes pnpm@11.19.0 test
npx --yes pnpm@11.19.0 build:netlify
npx --yes pnpm@11.19.0 bundle:netlify
npx --yes pnpm@11.19.0 dev:netlify --offline --no-open --skip-gitignore
```

`bundle:netlify` ejecuta `netlify build --offline --filter @ggs/api`: compila y empaqueta sin publicar. El comando antiguo `netlify functions:build` de esta versión de CLI no aplica toda la configuración de bundling; por eso no se usa. La CLI deja el ZIP y manifiesto en `apps/api/.netlify/functions`. Los archivos `.netlify` están ignorados.

Para arrancar se requieren `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. Las pruebas locales de arranque se hicieron con valores ficticios y `DATABASE_URL` vacía: validan HTTP, inicialización y rechazo de acceso, no Storage ni base de datos. No confundir `health.database=not_configured` con una conexión correcta.

La suite `pnpm test:integration` escribe fixtures y requiere PostgreSQL de pruebas con las migraciones y seed existentes. No apuntarla a producción. El fallo inicial por falta de PostgreSQL se resolvió con `compose.netlify-validation.yml`: las ocho pruebas pasan en una base aislada, sin puertos publicados. Las migraciones existentes y seed se ejecutaron exclusivamente allí. No se ejecutaron contra producción ni se modificaron. Los comandos completos y la prueba del pool están en [cierre predespliegue](NETLIFY_PREDEPLOY_CHECKS.md).

## URL, frontend y comprobaciones posteriores

URL esperada: `https://<nombre-del-proyecto>.netlify.app/api`. Comprobación: `GET https://<nombre-del-proyecto>.netlify.app/api/health`. La respuesta aceptable para una integración completa debe incluir `database: "connected"`. También se conserva `/health` sin prefijo.

En el alojamiento independiente del frontend, configurar:

```dotenv
VITE_API_URL=https://<nombre-del-proyecto>.netlify.app/api
```

No añadir barra final. Mantener `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` actuales. Reconstruir ese frontend en su proveedor cuando se autorice el cambio de URL. No se modifica `vercel.json` ni su configuración de despliegue. Los únicos ajustes de UI son formatos/límites de archivos y el transporte de descarga; se mantiene el diseño.

Antes de cambiar tráfico, comprobar con cuentas y recursos de pruebas:

1. `/api/health`: 200 y base conectada. `/api/auth/me`: 401 sin token o con token inválido; 200 con sesión válida activa; cuenta inactiva rechazada.
2. OPTIONS con Origin permitido obtiene `Access-Control-Allow-Origin` correspondiente; un origen no permitido no lo obtiene. CORS no bloquea clientes servidor ni sustituye JWT.
3. Cargar JPG/JPEG, PNG, WebP y PDF válidos de hasta 3 MiB. Confirmar metadata/auditoría. 3 MiB + 1 byte debe rechazarse. SVG, ejecutables, firmas falsas y Word deben rechazarse.
4. Crear/editar plantilla, activar versión, colocar imágenes y textos, resolver variables, adjuntar/colocar PDF, previsualizar y generar. Comprobar correlativo e historial, reintento idempotente y fallo de Storage sin registros huérfanos.
5. Descargar mediante `/signed-url` y mediante `/download` (302); ambos exigen permisos. URL firmada dura 300 s. Probar PDF final mayor de 4,5 MB con descarga directa de Storage.
6. Con usuario B y sin privilegios compartidos, intentar leer, firmar, descargar y eliminar IDs del usuario A; conservar los rechazos de acceso existentes. Un rol privilegiado mantiene el alcance definido en `resourceScope`.
7. Confirmar que Word histórico se lista y descarga sin conversión. Para nuevas generaciones sustituirlo por PDF; si el campo histórico admite solo Word, actualizar explícitamente sus formatos antes de reutilizarlo.

## Límites, rendimiento y riesgos pendientes

Según la documentación oficial consultada: función síncrona 60 s, memoria predeterminada 1024 MB, request/response buffered 6 MB; el contenido binario usa base64 y deja aproximadamente 4,5 MB útiles. Una carga de 3 MiB más multipart acotado queda por debajo. Las descargas no atraviesan ese límite porque usan Storage. La vista previa sigue siendo síncrona y binaria: una respuesta serializada mayor de 6.000.000 bytes se rechaza con 413 y sugiere generar/descargar mediante URL firmada.

La generación mantiene el motor y sus límites existentes (20 páginas, assets y PDFs con presupuestos del motor), pero no hay medición contra datos reales en Linux. Muchos adjuntos, descompresión de imágenes y un cold start pueden agotar memoria o 60 s. Un timeout forzoso no permite garantizar ejecutar el catch: después de reservar puede quedar un historial PROCESSING y una salida que necesite conciliación. No se cambió el modelo ni se introdujo una cola sin evidencia de carga. Si las mediciones reales se acercan al límite, antes de producción implementar un trabajo asíncrono durable con ID de petición, reserva única, transiciones idempotentes, reintentos y conciliación de Storage/PROCESSING; el frontend consultaría el estado. No basta con lanzar una promesa sin esperar desde una función.

En Windows, pnpm crea junctions con rutas absolutas y nft las conserva en el ZIP; no se debe usar ese artefacto en Linux. La validación nueva instala y empaqueta en Linux sin copiar node_modules, dist, `.netlify` o `.env*` del host. Extrae el ZIP fuera del workspace y exige que Sharp, Prisma y PDFKit resuelvan desde él. El sitio de pruebas futuro debe volver a construir desde Git y repetir los flujos reales en Netlify. Bookworm no sustituye la aceptación de AWS Lambda administrado ni de los servicios externos.

## Rollback

Mantener operativo el backend Railway durante la aceptación. Si falla Netlify, restaurar en el proveedor del frontend su `VITE_API_URL` anterior y reconstruir el frontend. Conservar CORS del backend anterior para ese frontend. No revertir base de datos: esta migración no requiere cambios de esquema. Revisar generaciones PROCESSING y archivos sin referencias antes de cualquier limpieza manual, sin borrar históricos. Una vez aprobado Git, el rollback de código debe usar el commit anterior o una reversión revisada; aquí no se ha creado ningún commit.

## Evidencia y archivos

Consultar [auditoría e inventario HTTP](NETLIFY_BACKEND_AUDIT.md), [resultados y lista de cambios](NETLIFY_BACKEND_VALIDATION.md) y [cierre predespliegue](NETLIFY_PREDEPLOY_CHECKS.md). Estos documentos distinguen pruebas con dobles, PostgreSQL real aislado y servicios externos pendientes.

Fuentes oficiales consultadas:

- [Netlify: configuración y límites de Functions](https://docs.netlify.com/build/functions/configuration/).
- [Netlify: dependencias de build y pnpm](https://docs.netlify.com/build/configure-builds/manage-dependencies/).
- [Netlify: alternativa nft para pnpm](https://answers.netlify.com/t/a-netlify-function-failed-to-require-one-of-its-dependencies/103848/14).
- [Sharp: binarios, Lambda y empaquetadores](https://sharp.pixelplumbing.com/install/).
- [Prisma 7: pool de conexiones](https://docs.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool).
- [serverless-http: adaptador original](https://github.com/dougmoscrop/serverless-http).
