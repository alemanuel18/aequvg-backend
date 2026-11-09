# ACS: casos de aceptación y evidencias (SCRUM-299)

## Base para la aceptación

Los casos se derivan de la implementación ACS presente en el repositorio y la descripción Sprint 5. No se encontró un alcance firmado/aprobado por el cliente ni un entorno externo de revisión. Los resultados automatizados validan el comportamiento de la aplicación y mocks; no equivalen a validación de contenido ni a aceptación del cliente. El entorno Postgres de integración debe estar disponible para cerrar las pruebas de persistencia.

## Casos trazables

| ID | Requisito/caso | Perfil | Prueba o evidencia | Resultado |
| --- | --- | --- | --- | --- |
| ACS-PUB-01 | El listado público permite consultar publicaciones vigentes. | Visitante | [`blog-acs.spec.ts`](../../aequvg-frontend/tests/e2e/blog-acs.spec.ts), listado y exclusión del borrador. | E2E escrito; bloqueado al ejecutar porque el entorno denegó abrir el servidor local (`EPERM`). |
| ACS-PUB-02 | El detalle enlazado presenta contenido, jerarquía y regreso al listado; el editor ofrece solo títulos 1–3 y controles de formato. | Visitante/administrador | [`blog-acs.spec.ts`](../../aequvg-frontend/tests/e2e/blog-acs.spec.ts), navegación de detalle y controles del editor. | E2E escrito; bloqueado por `EPERM`. |
| ACS-PUB-03 | La vista pública no tiene overflow horizontal a 320 px. | Visitante/móvil | [`blog-acs.spec.ts`](../../aequvg-frontend/tests/e2e/blog-acs.spec.ts), viewport 320 px. | E2E escrito; bloqueado por `EPERM`. |
| ACS-ROLE-01 | La API administrativa rechaza visitante y sesión estudiantil. | Visitante/estudiante | [`blog.access.test.ts`](../tests/integration/blog.access.test.ts). | Pasa en pruebas HTTP automatizadas. |
| ACS-ROLE-02 | Una sesión administrativa sin `BLOG_MANAGE` no lista ni crea. | Administrador limitado | [`blog.access.test.ts`](../tests/integration/blog.access.test.ts). | Pasa en pruebas HTTP automatizadas. |
| ACS-ROLE-03 | La navegación y la ruta administrativa se ocultan/protegen a cuenta sin permiso. | Administrador limitado | [`blog-acs.spec.ts`](../../aequvg-frontend/tests/e2e/blog-acs.spec.ts). | E2E escrito; bloqueado por `EPERM`. |
| ACS-ADMIN-01 | El editor genera slug, recupera el borrador local y pide confirmar antes de guardar; archivar también requiere confirmación. | Administrador | [`blog-acs.spec.ts`](../../aequvg-frontend/tests/e2e/blog-acs.spec.ts). | E2E escrito; bloqueado por `EPERM`; el flujo usa mock API. |
| ACS-ADMIN-02 | Alta, edición, publicación, archivo y eliminación persisten en PostgreSQL. | Administrador | Pendiente: entorno de integración ACS con BD aislada. | Pendiente de ejecutar. |
| ACS-ADMIN-03 | Portada e imágenes insertadas se cargan, conservan y sirven solo desde su entrada publicada. | Administrador/visitante | Contrato en [`aequvg-hoppscotch.json`](./aequvg-hoppscotch.json); faltan fixtures de archivo/BD para integración completa. | Pendiente de prueba con almacenamiento disponible. |
| ACS-REG-01 | Regresión de home y navegación general del sitio. | Visitante | [`public-site.spec.ts`](../../aequvg-frontend/tests/e2e/public-site.spec.ts) y [`visual-regression.spec.ts`](../../aequvg-frontend/tests/e2e/visual-regression.spec.ts). | Ejecutar regresión junto con ACS. |
| ACS-CLIENT-01 | Cliente revisa contenido, ubicación, permisos y resultado en entorno acordado. | Cliente | Sin acta ni entorno compartido registrado en el repositorio. | Pendiente de cliente. |

## Registro de ejecución

Completar esta tabla después de correr los comandos desde los repositorios correspondientes. Los tests de integración de backend con `BLOG_DATABASE_TEST=true` requieren implementación y entorno Postgres aislado; las pruebas de aceptación del frontend usan la API simulada de Playwright.

| Fecha | Comando | Resultado | Evidencia |
| --- | --- | --- | --- |
| 2026-11-09 | `bun run test -- tests/integration/blog.access.test.ts tests/integration/app.test.ts tests/unit/blog-content.test.ts` (backend) | 3 archivos, 30 pruebas aprobadas. | Salida Vitest de la sesión de trabajo; código de tests enlazado arriba. |
| 2026-11-09 | `bun run test` (backend) | 28 archivos aprobados; 307 pruebas aprobadas y 154 omitidas por dependencias de entorno. | Salida Vitest de la sesión de trabajo. |
| 2026-11-09 | `bun run typecheck` y `bun run build` (frontend) | Typecheck y build aprobados; el typecheck imprime un aviso existente de export de `vue-router/volar/sfc-route-blocks`. | Salida Nuxt de la sesión de trabajo. |
| 2026-11-09 | `bun run test` (frontend) | 18 archivos, 68 pruebas aprobadas. | Salida Vitest de la sesión de trabajo. |
| 2026-11-09 | `bun run test:e2e -- tests/e2e/blog-acs.spec.ts` | No iniciado: el sandbox denegó `listen` del mock API (`EPERM: operation not permitted`). | Error de arranque Playwright; no se generó trace ni captura. |
| 2026-11-09 | `bunx playwright test --list tests/e2e/blog-acs.spec.ts` | 3 casos cargan correctamente en Playwright. | Inventario de casos; no ejecuta navegador. |
| 2026-11-09 | `bun run test:integration:blog` (backend) | No ejecutado: PostgreSQL de prueba configurado en `db:5432` no está accesible. | Error Prisma de conexión; no se crearon datos de prueba. |
| Pendiente | Regresión E2E completa + integración PostgreSQL ACS | Requiere ejecutar en contenedor/red con Playwright y Postgres disponibles. | Adjuntar salida y capturas/trace en el próximo entorno. |

## Defectos y revisión del cliente

- Defectos de aplicación reproducidos: ninguno en las pruebas ejecutadas. Las pruebas E2E y PostgreSQL no pudieron iniciar por restricciones/ausencia del entorno, así que esos flujos permanecen sin verificar.
- Corrección durante la revisión de alcance: guardar/crear/editar, archivar y eliminar entradas ahora solicitan confirmación mediante el modal accesible del panel. El caso E2E cubre guardar y archivar; su ejecución queda pendiente por el bloqueo del servidor local.
- Pendientes conocidos: persistencia real con PostgreSQL/almacenamiento; validación editorial y aprobación del cliente; confirmación de ACS y la ubicación final; regresión E2E móvil/visual.
- Revisión del cliente: pendiente; registrar persona/fecha, decisiones y enlaces a comentarios o acta al recibirla. No hay validación atribuible al cliente en el estado actual.
