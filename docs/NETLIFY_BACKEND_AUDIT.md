# Auditoría del backend para Netlify

Fecha: 15 de octubre de 2026. Rama inicial main, árbol limpio. Auditoría previa a las modificaciones; implementación en deploy/netlify-backend.

## Hallazgos

- Workspace pnpm 11.19.0; API NestJS 11 CommonJS con decoradores compilados por tsc. No se debe transpilar directamente el TypeScript de Nest mediante esbuild: se perdería metadata. Frontend React/Vite independiente.
- Prisma 7.10.0 usa PrismaPg y pg.Pool. No necesita un motor Rust de consultas; sí necesita los archivos generados .prisma/client y el runtime JS/WASM de Prisma. No se alteró schema, migraciones ni seeds.
- JWT Supabase se verifica mediante jose: issuer, audience, firma, identificador y email. Guards globales SupabaseAuthGuard y PermissionsGuard. UserSync conserva activación, roles, bootstrap y organización. resourceScope conserva los permisos actuales, incluidos accesos privilegiados existentes.
- Supabase Storage usa service role exclusivamente en servidor, bucket privado, persistSession=false y autoRefreshToken=false. Archivos y PDFs tienen registros y auditoría; fallo al registrar una carga provoca limpieza compensatoria. No se usa disco local como almacenamiento persistente.
- Sharp decodifica JPG/PNG/WebP, limita a 20 megapíxeles y una página, aplica orientación y normaliza a JPG. Se conserva ese procesamiento y se aplica 3 MiB a entrada y salida normalizada. PDF conserva validación de extensión, MIME y firma.
- PDFKit/pdf-lib y paquetes compartidos trabajan en memoria. La prueba del artefacto Linux detectó una carga dinámica de `#standard-fonts/Helvetica` que nft no incluía. Se añadieron a `included_files` los directorios `js/standard-fonts/**` y `js/data/**` de PDFKit, conservando las fuentes y perfiles usados por el motor.
- LibreOffice era el único ejecutable externo, mediante child_process y archivos temporales. La conversión ahora responde 400; no se elimina el módulo ni datos históricos. No había controlador HTTP independiente de conversión. Word histórico puede listarse/descargarse; se rechaza para nuevas generaciones antes de reservar correlativo.
- No se encontraron cron, colas, WebSockets ni timers de trabajo que requieran un proceso persistente en el backend. Los clientes y el pool se reutilizan con la instancia Nest caliente.
- La generación prepara y renderiza antes de reservar; reserva correlativo bajo transacción y locks; luego carga salida y completa historial. Se mantienen idempotencia, bloqueo y compensaciones existentes. Un corte forzoso después de reservar todavía puede dejar PROCESSING; consultar riesgos del despliegue.
- Las descargas HTTP redirigen después de autorizar y auditar hacia URL firmada de 300 s. El frontend solicita la URL firmada autenticada y descarga de Storage sin enviar el bearer de Supabase Auth al destino. Las vistas previas siguen devolviendo binario; una respuesta serializada superior a 6.000.000 bytes recibe 413.

## Dependencias y empaquetado

serverless-http adapta Express a eventos Lambda sin listen. Nest se compila con tsc. Netlify nft traza JS, paquetes workspace, recursos y binarios nativos, conservando estructura de módulos. La prueba con esbuild y dependencias externas falló al leer directorios de paquetes con exports; nft completó el empaquetado. El ZIP local contiene Prisma generado y Sharp de Windows. No se considera desplegable en Linux: el despliegue futuro debe instalar y empaquetar desde Git en Netlify/Linux.

El cierre agrega `compose.netlify-validation.yml` y `tools/netlify-validation/`: instalación Linux limpia con Node 24 y pnpm 11.19.0, PostgreSQL 16 aislado, ocho integraciones originales y dos pruebas del pool real. No usa puertos publicados ni la base del sistema actual. Los paths de Base/Package/Build/Publish/Functions no requirieron cambios. La compatibilidad de servicios externos y del runtime administrado sigue pendiente; consultar [cierre predespliegue](NETLIFY_PREDEPLOY_CHECKS.md).

## Inventario HTTP (51 rutas)

Todas las rutas siguientes están disponibles también bajo /api. Los decoradores Permissions requieren todos los permisos indicados; se conservan las comprobaciones adicionales de servicios y propiedad.

| Método | Ruta original | Acceso |
| --- | --- | --- |
| GET | /health | Publica |
| GET | /audit | audit.read |
| GET | /auth/me | JWT; sin permiso adicional |
| GET | /file-fields | file_fields.read |
| POST | /file-fields | file_fields.create |
| PATCH | /file-fields/:id | file_fields.update |
| DELETE | /file-fields/:id | file_fields.delete |
| POST | /files | files.upload |
| GET | /files/:id/download | files.read |
| GET | /files/:id/signed-url | files.read |
| DELETE | /files/:id | files.delete |
| GET | /files | files.read |
| GET | /files/:id | files.read |
| POST | /generations | generations.create |
| POST | /generations/preview | generations.create |
| GET | /generations | generations.read |
| GET | /generations/:id/download | generations.download |
| GET | /generations/:id/signed-url | generations.download |
| GET | /generations/:id | generations.read |
| DELETE | /generations/:id | generations.delete |
| GET | /owner-profile | owner.read |
| PATCH | /owner-profile | owner.update |
| GET | /company | owner.read |
| PATCH | /company | owner.update |
| GET | /roles | roles.read |
| POST | /roles | roles.create |
| GET | /roles/:id | roles.read |
| PATCH | /roles/:id | roles.update, permissions.assign |
| DELETE | /roles/:id | roles.delete |
| GET | /permissions | permissions.read |
| GET | /templates/:templateId/versions | template_versions.read |
| POST | /templates/:templateId/versions | template_versions.create |
| GET | /templates/:templateId/versions/:versionId | template_versions.read |
| PUT | /templates/:templateId/versions/:versionId | template_versions.update |
| POST | /templates/:templateId/versions/:versionId/activate | template_versions.update |
| POST | /templates/:templateId/versions/:versionId/duplicate | template_versions.create |
| POST | /templates | templates.create, template_versions.create |
| PATCH | /templates/:id | templates.update |
| PUT | /templates/:id | templates.update, template_versions.create |
| POST | /templates/:id/archive | templates.delete |
| POST | /templates/:id/restore | templates.update |
| DELETE | /templates/:id | templates.delete |
| GET | /templates | templates.read |
| GET | /templates/:id | templates.read |
| GET | /users | users.read |
| POST | /users | users.create |
| GET | /users/:id | users.read |
| PATCH | /users/:id | users.update |
| POST | /users/:id/activate | users.deactivate |
| POST | /users/:id/deactivate | users.deactivate |
| POST | /users/:id/roles | users.update, permissions.assign |

Los controladores pdf, storage y template-elements no agregan métodos HTTP; sus servicios siguen disponibles a los módulos existentes. CORS no reemplaza la autenticación: las peticiones sin Origin pueden usarse desde clientes servidor.
