# Enlaces de tesis: modelo y contrato

Este módulo publica en AEQUVG enlaces a tesis que permanecen alojadas en el repositorio universitario. AEQUVG guarda los metadatos necesarios para presentar y administrar cada referencia; no descarga, almacena ni modifica el archivo universitario.

## Modelo de datos

El modelo Prisma `ThesisLink` se almacena en `enlace_tesis` y está definido en [`prisma/schema.prisma`](../prisma/schema.prisma). La migración inicial es [`20261108120000_thesis_links`](../prisma/migrations/20261108120000_thesis_links/migration.sql).

| Campo | Columna | Regla |
| --- | --- | --- |
| `id` | `id_enlace_tesis` | Entero autogenerado, clave primaria. |
| `sourceIdentifier` | `identificador_origen` | Identificador del repositorio, opcional y único cuando se proporciona. |
| `title` | `titulo` | Obligatorio en base de datos; entre 3 y 300 caracteres en el contrato de alta. |
| `author` | `autor` | Opcional en el contrato API; hasta 300 caracteres. La interfaz administrativa actual lo exige. |
| `publicationYear` | `anio_publicacion` | Opcional; entero de 1900 a 9999. |
| `summary` | `resumen` | Opcional; texto de hasta 12,000 caracteres por API. |
| `url` | `url` | Obligatoria, hasta 2,048 caracteres, única; la API solo admite `http://` y `https://`. |
| `createdById` | `creado_por` | Administrador autenticado que creó el registro; FK con eliminación restringida. No se toma del cuerpo de la solicitud. |
| `createdAt`, `updatedAt` | `creado_en`, `actualizado_en` | Fechas de creación y modificación. |
| `publishedAt` | `publicado_en` | Nulo para borrador; con fecha no futura para aparecer en consulta pública. |

Los índices únicos impiden repetir URL e identificador de origen. No hay un campo de archivo ni una relación entre tesis y comentarios; el contrato de comentarios de S4 excluye las tesis. Retirar el enlace elimina el registro local; no llama al repositorio UVG.

## Permisos y operaciones

La consulta pública no requiere inicio de sesión. La administración requiere una sesión administrativa con `PAPERS_MANAGE`; las operaciones de escritura requieren además `X-CSRF-Token`. Las cuentas de estudiantes no reciben ese permiso. El backend vuelve a aplicar la autorización en cada solicitud.

Base URL local: `http://localhost:3000/api/v1`. OpenAPI en [`/openapi`](http://localhost:3000/openapi) (JSON: `/openapi/json`). La [colección Hoppscotch](./aequvg-hoppscotch.json) incluye solicitudes de consulta pública, listado administrativo, alta, edición, eliminación y errores comunes.

Para ejecutar solicitudes administrativas en Hoppscotch, inicia sesión con `POST /auth/login`, copia las cookies administrativas de la respuesta a `adminSessionCookie` y el `csrfToken` del JSON a `csrfToken`. La cuenta debe tener `PAPERS_MANAGE`. En el ejemplo de alta, usa un handle de demostración único; después de crear, copia el `id` de respuesta a `thesisId` para editar o eliminar. Ejecuta la solicitud de duplicado después de la alta para obtener el `409` esperado. La colección apunta a `localhost` y sus datos son demostrativos.

| Método y ruta | Acceso | Comportamiento y respuestas relevantes |
| --- | --- | --- |
| `GET /theses?page=1&pageSize=20&q=...` | Público | Lista publicaciones vigentes; `q` busca por título, autor o resumen. `pageSize` máximo 100. |
| `GET /theses/:id` | Público | Devuelve metadatos y URL de origen; `404 THESIS_NOT_FOUND` si no existe o no está publicada. |
| `GET /admin/theses?page=1&pageSize=20` | `PAPERS_MANAGE` | Lista todos los registros, incluidos borradores. |
| `POST /admin/theses` | `PAPERS_MANAGE` + CSRF | Crea registro; responde `201`. `409 THESIS_LINK_EXISTS` si URL o identificador están duplicados; `422 INVALID_THESIS_URL` si la URL no es HTTP/HTTPS. |
| `PUT /admin/theses/:id` | `PAPERS_MANAGE` + CSRF | Actualiza los campos enviados. Responde `404 THESIS_NOT_FOUND`, `409 THESIS_LINK_EXISTS` o `422 INVALID_THESIS_URL` según el caso. |
| `DELETE /admin/theses/:id` | `PAPERS_MANAGE` + CSRF | Elimina el registro local. `404 THESIS_NOT_FOUND` si ya no existe. No elimina el archivo del repositorio. |

Las rutas administrativas responden `401` sin sesión y `403` cuando la cuenta no tiene permiso o falla el token CSRF. Las validaciones de esquema responden `422`. Las respuestas de error siguen `{ "error": { "code": "...", "message": "..." } }`.

### Campos obligatorios: API e interfaz

La API exige `title` y `url` al crear; `author`, año, resumen e identificador de origen son opcionales en su esquema. La interfaz administrativa exige título, URL **y autor**; año, resumen e identificador aparecen como opcionales. Por ello, pegar solo la URL no completa hoy el formulario. La aceptación de esta tarea pide describir URL como único campo obligatorio y contradice el formulario y el acuerdo de mantener título y autor. Esta guía no afirma que esa modificación esté implementada; se requiere alinear el criterio antes de cambiar o prometer el flujo.

## Flujo actual

1. Un miembro autorizado de la junta entra al panel y captura los datos requeridos por la interfaz junto con la URL universitaria.
2. Puede guardar como borrador o marcar **Publicar ahora**. Publicar fija `publishedAt` y vuelve visible la ficha en `/investigacion`.
3. Puede editar metadatos o URL desde el panel. Una URL duplicada se rechaza con un mensaje claro.
4. Al eliminar, la publicación sale de AEQUVG; el documento y la ficha original de UVG no reciben solicitudes de modificación.

La URL externa puede requerir sesión institucional o no estar disponible. AEQUVG abre el origen y explica que la disponibilidad y los requisitos dependen de UVG; no copia archivos ni altera permisos del repositorio.

## Evidencia y dependencias

- [Matriz E2E y permisos](https://github.com/alemanuel18/aequvg-frontend/blob/test/thesis-e2e-permissions/docs/thesis-e2e-permissions.md).
- [Registro de defectos y repeticiones](https://github.com/alemanuel18/aequvg-frontend/blob/test/thesis-e2e-permissions/docs/thesis-defect-log.md).
- [Informe de investigación del repositorio UVG](./thesis-repository-research.md).
- [Guía para estudiantes](https://github.com/alemanuel18/aequvg-frontend/blob/docs/thesis-documentation/docs/guides/thesis-students.md) y [guía para la junta](https://github.com/alemanuel18/aequvg-frontend/blob/docs/thesis-documentation/docs/guides/thesis-board.md).

No hay una aprobación de cliente o de junta registrada en estos documentos. El flujo implementado es manual; la automatización no está activada ni se presenta como disponible. Los posibles pasos para automatizar solo se consideran después de confirmar modalidad y permisos, y de validar con el responsable del repositorio las condiciones de uso.
