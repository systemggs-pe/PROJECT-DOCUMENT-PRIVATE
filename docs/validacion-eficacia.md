# Validacion de eficacia de GGS Document Studio

Fecha de ejecucion: 2026-09-14. Entorno local, API puerto 3000, web puerto 5173, PostgreSQL local, Supabase Auth y Supabase Storage configurados.

## Dictamen

**Resultado: recorrido documental principal y editor visual comprobados en entorno local.**

Se verificaron autenticacion real, sincronizacion de identidad, editor visual de versiones, persistencia de elementos, creacion HTTP de plantilla, subida y normalizacion de imagen, generacion de PDF valido, descarga privada, URL firmada, idempotencia y aislamiento entre usuarios. El recorrido crear plantilla -> editar version -> subir imagen -> generar PDF -> descargarlo funciona con fixtures sinteticos y limpieza confirmada.

## Arquitectura y alcance

React/Vite -> NestJS -> Prisma/PostgreSQL. Supabase Auth emite el token; NestJS valida su firma y resuelve el usuario local. Las consultas de plantillas, archivos y generaciones filtran por propietario. Supabase Storage conserva los binarios privados; PDFKit genera el documento a partir de snapshots de version.

Se revisaron los objetivos del documento original y el alcance hasta Fase 5 del README. No se modificaron credenciales ni se implementaron funcionalidades fuera del alcance documental actual.

## Inventario contrastado

| Funcion y entrada                                        | Resultado observado                                                      | Estado                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Salud de API y PostgreSQL                                | GET /health devuelve 200 y database=connected                            | FUNCIONA                                                   |
| Login Supabase por email/password                        | Dos cuentas sinteticas obtuvieron tokens validos y accedieron a /auth/me | FUNCIONA por API                                           |
| Sincronizacion de identidad                              | Token -> usuario persistido; peticiones repetidas conservan el mismo ID  | FUNCIONA                                                   |
| Acceso sin token o con token invalido                    | /auth/me, /templates, /files y /generations responden 401                | FUNCIONA                                                   |
| Usuario local inactivo                                   | Un token valido recibe 403 en /auth/me                                   | FUNCIONA en backend                                        |
| Plantilla A4 y slots                                     | Detalle devuelve dimensiones y dni_front, dni_back, photo obligatorios   | FUNCIONA por API                                           |
| Privacidad de plantillas                                 | Listado propio y acceso cruzado A/B rechazado con 404                    | FUNCIONA por HTTP real                                     |
| Privacidad de archivos/generaciones                      | Recursos cruzados A/B responden 404 por HTTP autenticado                  | FUNCIONA por E2E real                                       |
| Flujo HTTP de plantilla, upload y PDF                    | Plantilla A4, imagen sintetica, PDF descargable y metadata persistida     | FUNCIONA por E2E real                                       |
| Storage privado y URL firmada                            | Objeto privado subido, URL firmada y descarga con MIME application/pdf    | FUNCIONA por E2E real                                       |
| Idempotencia de generacion                               | Repetir requestKey devuelve la misma generacion y output                  | FUNCIONA por E2E real                                       |
| Versiones y slots unicos                                 | Crea v2, duplica v1, activa una sola version y conserva keys unicas       | FUNCIONA por E2E/integracion                               |
| Correlativos                                             | 50 peticiones concurrentes y una generacion E2E producen valores unicos  | FUNCIONA en integracion/E2E                                |
| Relaciones historicas                                    | Restrict impide borrar registros referenciados                           | PARCIAL; no prueba inmutabilidad ante ediciones            |
| Formulario web vacio                                     | Muestra errores de email y password                                      | FUNCIONA en navegador                                      |
| Editor y CRUD de plantillas                              | Editor visual, guardado de version exacta, archivado y duplicacion        | FUNCIONA en web/API/E2E                                     |
| Persistencia de elementos visuales                       | IMAGE, TEXT, RECTANGLE y LINE se guardan y recargan en puntos             | FUNCIONA por E2E Fase 5                                     |
| Formulario dinamico y subida de imagenes                 | Slots IMAGE descubiertos, validacion y normalizacion a JPEG               | FUNCIONA en web/API                                         |
| Renderizado y descarga PDF                               | PDFKit genera documento A4 valido y el endpoint descarga bytes reales     | FUNCIONA por E2E real                                       |
| Storage privado y URLs firmadas                          | Bucket privado, lectura autenticada, eliminacion y URLs de 60 segundos    | FUNCIONA por E2E real                                       |
| Historial web y auditoria de operaciones                 | Historial lista generaciones y auditoria registra operaciones             | FUNCIONA en web/API                                         |
| Registro con confirmacion, Google, refresco y logout web | No ejecutados en esta evaluacion                                         | NO VERIFICADO                                              |

## Hallazgos

### P1: El recorrido vertical ya esta operativo

- Evidencia: `pnpm verify:phase4` completo con 13 comprobaciones y limpieza de fixtures.
- Impacto: el objetivo principal ya es comprobable localmente. Quedan pruebas de volumen, precision visual exhaustiva y despliegue fuera del entorno local.
- Seguimiento: ampliar la matriz de formatos y medir latencia con documentos reales autorizados o fixtures representativos.

### P2: La web consulta la identidad autorizada por el backend al entrar

- Evidencia: `IdentityGate` llama `/auth/me`, sincroniza la identidad y bloquea estados 401, 403 y error de red con reintento.
- Impacto: el acceso a la interfaz queda alineado con la autorizacion del backend. La prueba automatizada de usuario inactivo continua cubierta por Fase 3.
- Seguimiento: completar una prueba manual de navegador con una cuenta real de desarrollo.

### P2: Advertencia de bundle web

- Evidencia: `pnpm audit --prod --json` devuelve 0 avisos en 247 dependencias de produccion.
- Impacto: el build de Vite avisa que el bundle principal supera 500 kB; no bloquea la funcionalidad, pero puede afectar la carga inicial.
- Solucion propuesta: dividir las vistas pesadas restantes mediante `manualChunks` o imports diferidos antes de produccion.

### P2: Precision visual y volumen aun requieren medicion ampliada

- Evidencia: el E2E valida `%PDF`, MIME, tamano, una descarga y snapshot de version; la suite de integracion valida las restricciones historicas.
- Impacto: aun no se ha medido tolerancia de posiciones mediante inspeccion visual ni rendimiento con una muestra de 20 documentos.
- Solucion: ampliar fixtures con varias imagenes, comparar renderizados y registrar latencia/tamano por generacion.

### P3: Estado visible actualizado

- Evidencia: dashboard, sidebar y README muestran el flujo de plantillas, archivos, generaciones e historial disponible.
- Impacto: el alcance actual queda visible para la prueba local.

## Ejemplo reproducible: DNI + Foto

Desde la raiz del repositorio, con la API, PostgreSQL y Supabase activos y .env configurado:

```powershell
pnpm verify:phase4
```

El ejemplo crea dos usuarios ficticios en Supabase Auth, inicia sesion por API, crea una plantilla mediante `POST /templates`, sube un PNG sintetico mediante `POST /files`, genera un PDF mediante `POST /generations`, valida la descarga y la URL firmada, comprueba aislamiento A/B y repite la solicitud para verificar idempotencia. Finalmente elimina metadata local, objetos de Storage e identidades temporales.

Datos de la plantilla E2E: A4 vertical, 595.28 x 841.89 puntos, margenes de 28.35 puntos, una pagina y modo contain con borde. Coordenadas medidas desde la esquina superior izquierda:

| Slot  | X    | Y  | Ancho | Alto  | Requerido |
| ----- | ---- | -- | ----- | ----- | --------- |
| photo | 56.7 | 96 | 226.8 | 141.7 | Si        |

Resultado ejecutado: **13 comprobaciones aprobadas**, con limpieza confirmada de plantilla, versiones, slots, imagen, PDF, usuarios locales, objetos privados y las dos identidades temporales de Supabase. No imprime tokens ni claves ni usa documentos personales. La generacion si avanza el correlativo global, como una generacion real; el registro documental y sus archivos temporales se eliminan al terminar.

Si se interrumpe el proceso por cierre forzado o perdida de energia, finally puede no completarse. Los usuarios temporales tienen email ggs-e2e-<UUID>@example.com y la plantilla tiene prefijo E2E DNI + Foto. Ante fallo de limpieza el script informa que las fixtures requieren revision.

## Criterios para corroborar el objetivo final

Estos son criterios propuestos de aceptacion, no resultados ya obtenidos:

1. Crear y guardar la plantilla anterior desde la web; recargar y conservar exactamente sus dimensiones y slots.
2. Seleccionarla para generar y obtener tres campos de imagen descubiertos desde sus keys. Usar imagenes sinteticas rotuladas FRENTE DEMO, REVERSO DEMO y FOTO DEMO, sin DNI real.
3. Omitir un campo obligatorio o enviar un archivo invalido: rechazarlo tanto en UI como en backend, sin generar registros completados.
4. Enviar tres imagenes validas: producir un PDF de una pagina A4, sin deformacion en contain. Medir posiciones y dimensiones con tolerancia propuesta de 1 punto y revisar el renderizado visual.
5. Asignar un correlativo unico, persistir inputs, version y archivo privado; comprobar descarga autorizada con MIME y contenido PDF reales.
6. Desde el usuario B, rechazar acceso directo a generacion, archivo y descarga de A; comprobar tambien expiracion de URL firmada.
7. Crear una version 2 con posiciones diferentes. La generacion previa debe seguir vinculada a version 1 y conservar exactamente el hash del PDF anterior.
8. Provocar doble envio, fallo de subida y fallo del renderizador: comprobar estados consistentes, politica de reintentos y ausencia de documentos duplicados.
9. Generar una muestra de 20 documentos validos: registrar exito, duracion, tamano y fidelidad; acordar un objetivo de latencia con ese volumen y entorno. Todavia no existe medicion de velocidad PDF.

## Pruebas y limites

- pnpm lint y pnpm typecheck: aprobados. El ejemplo tambien paso ESLint y node --check.
- pnpm build: aprobado. Bundle JavaScript de 658.44 kB (194.39 kB gzip); Vite avisa que supera 500 kB. Rollup omite anotaciones de comentarios de Zod. Son advertencias no bloqueantes; no se midio la latencia de carga en movil.
- pnpm test: 28 tests aprobados en 14 archivos. Incluye contratos y mocks; no son 28 flujos completos de usuario.
- pnpm test:integration: 8 tests aprobados contra PostgreSQL, incluida concurrencia de 50 correlativos, versionado, guardado de elementos del editor y aislamiento en servicios.
- node docs/examples/verify-phase3.mjs: 13 comprobaciones HTTP/datos aprobadas con Supabase real; limpieza completada.
- Navegador: se verifico /login, el rechazo de campos vacios y el flujo visual de plantilla/editor disponible. En Fase 5 se creo una plantilla temporal desde `/templates/new`, se agregaron 4 elementos, se uso preview/zoom, se guardo, se reabrio con `Capas (4)`, se duplico a version 2 y se elimino la fixture por ID.
- `pnpm verify:phase4`: 13 comprobaciones HTTP/datos/Storage aprobadas con Supabase real; limpieza completada.
- `pnpm verify:phase5`: 11 comprobaciones HTTP/datos aprobadas con Supabase real; limpieza completada.
- `pnpm audit --prod --json`: 0 avisos de produccion.
- Un primer intento de integrar tests en paralelo coincidio con prisma generate y fallo con EBUSY de Windows. La repeticion secuencial termino correctamente; evitar regenerar el mismo cliente en paralelo.
- No se probaron carga sostenida, cuotas, recuperacion ante caidas ni precision visual PDF exhaustiva. Roles, organizaciones, IMEI, ventas e inventario no pertenecen al alcance evaluado; el modelo actual aplica ownership por usuario.

## Prioridades

P0: ninguno confirmado en esta evaluacion. P1: ampliar la matriz de precision visual y volumen antes de produccion. P2: dividir el bundle web y completar una sesion manual de navegador con cuenta de desarrollo. Billing y colaboracion siguen fuera de alcance.
