# Flujo administrativo de proyectos

## Pantallas y pasos de uso

La administración está en `/administrador/proyectos` (también acepta el alias `/administrador/investigacion`). Se accede desde el panel con una cuenta activa que tenga `PROJECTS_MANAGE`. El servidor valida el permiso en cada ruta; el guard visual no es un control de seguridad.

1. Abrir **Proyectos de investigación**. El listado permite buscar por texto y filtrar por estado (`EN_REVISION`, `APROBADO`, `NO_APROBADO`) y tipo (`PROYECTO`, `TESIS`); está paginado.
2. Usar **Nuevo proyecto** o **Editar**. Completar título (3–220 caracteres), slug (3–220), descripción (mínimo 10), tipo y URLs opcionales HTTP/HTTPS. El autor se atribuye a la sesión autenticada, nunca al formulario. El slug se sugiere desde el título y debe ser único.
3. Si corresponde, cargar PDF. La UI admite `application/pdf` hasta 25 MB; el backend vuelve a comprobar MIME, tamaño y cabecera `%PDF-`. La API responde con metadatos y el ID, que se envía como `documentFileId`. Se permite crear sin PDF.
4. Confirmar el alta o edición en el diálogo. El botón evita doble envío mientras se guarda o carga. Al crear, el estado es `EN_REVISION` y todavía no aparece en el catálogo público.
5. Consultar detalle para revisar metadatos y PDF. Cambiar el estado desde el selector solicita confirmación: `APROBADO` publica el proyecto; `NO_APROBADO` lo excluye; `EN_REVISION` lo mantiene fuera del público. La API acepta `rejectionReason` para rechazo.
6. Editar un proyecto `APROBADO` lo devuelve automáticamente a `EN_REVISION` y limpia revisor/fecha de revisión, hasta que vuelva a revisarse.
7. Eliminar requiere confirmación y es permanente para el registro de proyecto. Un archivo asociado no debe borrarse por separado; `DELETE /api/v1/admin/files/:id` rechaza archivos referenciados (`409 FILE_IN_USE`).
8. Verificar el resultado en el catálogo público `/investigacion`: solo devuelve proyectos `APROBADO`; la descarga del PDF también requiere que el proyecto esté aprobado.

La vista presenta estados de carga, error recuperable, lista vacía, detalle y notificaciones de éxito/error. La validación es visible, el foco se dirige al primer campo inválido y los controles se adaptan a móviles. El acceso es por teclado y las confirmaciones se realizan antes de mutar datos.

## Contrato HTTP vigente (sin cambios en esta documentación)

Todas las rutas `/admin` requieren sesión activa, `PROJECTS_MANAGE`; las escrituras requieren además `X-CSRF-Token` válido.

| Método | Ruta | Propósito |
| --- | --- | --- |
| `GET` | `/api/v1/admin/projects?q=&status=&type=&page=&pageSize=` | Lista todos los estados; `pageSize` máximo 50. |
| `GET` | `/api/v1/admin/projects/:id` | Detalle administrativo y metadatos del PDF. |
| `POST` | `/api/v1/admin/projects/files` | Carga multipart, parte `file`, solo PDF de hasta 25 MB. |
| `GET` | `/api/v1/admin/projects/:id/document` | Consulta/descarga administrativa del documento asociado. |
| `POST` | `/api/v1/admin/projects` | Crea y asigna autor desde sesión; estado inicial `EN_REVISION`. |
| `PUT` | `/api/v1/admin/projects/:id` | Actualiza campos opcionales; cambios de un aprobado exigen nueva revisión. |
| `PATCH` | `/api/v1/admin/projects/:id/review` | Cuerpo `{ "status": "APROBADO" }` o estado alternativo; acepta `rejectionReason`. Revisor desde sesión. |
| `DELETE` | `/api/v1/admin/projects/:id` | Elimina el proyecto permanentemente. |

Público: `GET /api/v1/projects` lista solo aprobados y admite `search`, `year` (año UTC), `type`, `sortBy`, `sortOrder`, `page`, `pageSize` (máximo 100); `GET /api/v1/projects/:id` y `GET /api/v1/projects/:id/document` solo resuelven proyectos aprobados. Respuesta de listado: `{ items, pagination: { page, pageSize, total, totalPages } }`.

DTO: `type` es `TESIS|PROYECTO`; `repositoryUrl`/`liveUrl`, si existen, deben ser URI; `documentFileId` debe referir archivo existente con MIME PDF. Slug duplicado devuelve `409 PROJECT_SLUG_EXISTS`; documento inexistente o no PDF `422 INVALID_PROJECT_DOCUMENT`; PDF inválido `422 PDF_REQUIRED`, `UNSUPPORTED_FILE_TYPE`, `FILE_TOO_LARGE` o `INVALID_PDF_CONTENT`; IDs inexistentes `404 PROJECT_NOT_FOUND`. El envelope de error es `{ "error": { "code", "message", "details?" } }`.

## Casos de prueba

Automatizados existentes:

- `tests/unit/project.service.test.ts`: validación de servicio y reglas de creación/edición/revisión.
- `tests/integration/projects.database.test.ts`: creación, edición, revisión, visibilidad pública, filtros/paginación, eliminación, acceso sin sesión y errores por ID/slug.
- `tests/integration/file.api.database.test.ts`: carga, persistencia, rechazo MIME inválido, bloqueo de eliminación de archivo referenciado y eliminación posterior.

Casos de regresión manual a conservar:

| Caso | Resultado esperado |
| --- | --- |
| Sin sesión consulta el listado admin | `401`; sin lectura de administración. |
| Usuario sin `PROJECTS_MANAGE` lista, carga o muta | `403 FORBIDDEN`; no cambia datos/archivos. |
| Escritura sin CSRF | `403 CSRF_TOKEN_INVALID`; no muta. |
| Crear con entradas válidas | `201`; autor de sesión y estado `EN_REVISION`; no visible en catálogo público. |
| Crear/editar con slug duplicado | `409 PROJECT_SLUG_EXISTS`; sin mutación. |
| PDF con MIME válido pero cabecera inválida, MIME no permitido o >25 MB | `422`; sin fila/binario persistidos. |
| Aprobar proyecto | `200`; visible en catálogo y documento público disponible. |
| Editar un aprobado | `200`; pasa a `EN_REVISION`, desaparece de listado y descarga pública da `404`. |
| Rechazar proyecto | `200`; fuera del catálogo público. |
| Eliminar archivo asociado | `409 FILE_IN_USE`; proyecto y archivo siguen íntegros. |
| Eliminar proyecto | `200`; deja de ser administrable/público; conservar integridad de metadatos/binarios asociados según referencias restantes. |

Los ejemplos API generales están en `docs/aequvg-hoppscotch.json`; esta guía no altera sus solicitudes ni el OpenAPI porque no cambia ningún contrato.

## Defectos y límites observados

- El flujo de proyecto no tiene una prueba Playwright administrativa dedicada en el repositorio; los pasos visuales y la validación responsive deben comprobarse manualmente hasta agregar esa cobertura.
- El acceso a la UI de proyectos está protegido por la navegación y el guard; la autorización real se confirma únicamente por los endpoints. No se detectó una brecha concreta que justifique remodelar el CRUD o la base de datos.

Resultados ejecutados y ambiente se anotan en [`admin-flows-evidence.md`](admin-flows-evidence.md).
