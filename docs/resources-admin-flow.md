# Flujo administrativo: recursos para estudiantes

## Alcance

El módulo administra materiales académicos compuestos por título, descripción, categoría, estado y uno de estos destinos: un archivo almacenado o uno o más enlaces HTTP/HTTPS. La autorización se decide en el backend; ocultar botones, acceder desde `/administrador`, enviar `Origin` o depender de CORS no sustituye la sesión ni el permiso `RESOURCES_MANAGE`.

## Pantallas y pasos de uso

1. Abrir `/administrador` e iniciar sesión con una cuenta institucional activa.
2. Desde `/administrador/panel`, abrir **Recursos**. El módulo requiere `RESOURCES_MANAGE`.
3. En `/administrador/recursos`, revisar el listado, búsqueda, categoría, estado, autor y fecha.
4. Seleccionar **Nuevo recurso** o **Editar**. Completar categoría, título, descripción y estado.
5. Para un archivo, elegir PDF, DOC, DOCX o ZIP. El frontend lo carga mediante `POST /api/v1/admin/files` y coloca el `fileId` recibido en el formulario.
6. Para un enlace, agregar etiqueta y URL `http://` o `https://`.
7. Guardar y confirmar en el diálogo. El botón se deshabilita mientras se procesa la carga o el guardado para evitar envíos duplicados.
8. Para cambiar el estado, usar la lista de estado de la fila y confirmar. Un recurso archivado deja de aparecer públicamente.
9. Para eliminar, confirmar la acción. El recurso y sus enlaces se eliminan; el archivo asociado se conserva para evitar referencias rotas y solo puede eliminarse después de quedar sin referencias.

El catálogo público está en `/recursos`. Muestra únicamente recursos `PUBLICADO`, vigentes y de categorías activas. Cuando existe un archivo, el detalle incluye `downloadUrl` y el enlace descarga el binario mediante `GET /api/v1/resources/:id/download`.

## Contrato API

### Público

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/api/v1/resources/categories` | Categorías activas. |
| GET | `/api/v1/resources` | Lista paginada y filtrable por `q`, `categoryId`, `page` y `pageSize`. |
| GET | `/api/v1/resources/:id` | Detalle publicado y vigente; si tiene archivo incluye `file.downloadUrl`. |
| GET | `/api/v1/resources/:id/download` | Descarga el archivo asociado a un recurso publicado y vigente. |

### Administración

Todas las escrituras requieren sesión administrativa, `RESOURCES_MANAGE` y `X-CSRF-Token`.

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/v1/admin/resources` | Lista todos los estados; admite `q`, `categoryId`, `status`, `page` y `pageSize`. |
| GET | `/api/v1/admin/resources/:id` | Consulta un recurso sin filtrar por publicación. |
| POST | `/api/v1/admin/files` | Carga multipart con el campo `file`. Devuelve el `fileId`. |
| DELETE | `/api/v1/admin/files/:id` | Elimina metadatos y binario únicamente si el archivo no tiene referencias. |
| POST | `/api/v1/admin/resources` | Crea un recurso. |
| PUT | `/api/v1/admin/resources/:id` | Edita datos; `fileId` sustituye el archivo y `links` reemplaza todos los enlaces. |
| PATCH | `/api/v1/admin/resources/:id/archive` | Archiva y limpia `publishedAt`. |
| DELETE | `/api/v1/admin/resources/:id` | Elimina el recurso y sus enlaces, conservando el archivo asociado. |

## Validaciones y errores

- `PUBLICADO` requiere un archivo válido o al menos un enlace.
- Título: mínimo 3 caracteres; descripción: mínimo 10; ambos se limpian antes de validar.
- Los enlaces deben ser URLs HTTP/HTTPS válidas, tener etiqueta de al menos 2 caracteres y no repetirse.
- El archivo debe existir y conservar MIME, almacenamiento y tamaño utilizables. Las cargas aceptan PDF, DOC, DOCX y ZIP de hasta 25 MB.
- `401 UNAUTHORIZED` corresponde a ausencia de sesión; `401 INVALID_SESSION` a sesión inválida o expirada; `403 FORBIDDEN` a falta de `RESOURCES_MANAGE`; `403 ACCOUNT_DISABLED` a cuenta o rol inactivo.
- `422 RESOURCE_DESTINATION_REQUIRED`, `INVALID_RESOURCE_CONTENT`, `INVALID_RESOURCE_FILE`, `INVALID_RESOURCE_LINK`, `DUPLICATE_RESOURCE_LINK` y `UNSUPPORTED_FILE_TYPE` rechazan entradas inválidas sin persistirlas.
- `404 RESOURCE_NOT_FOUND` o `FILE_NOT_FOUND` identifica recursos inexistentes.
- `409 FILE_IN_USE` impide borrar un archivo todavía referenciado por un recurso u otro módulo.

## Defectos registrados y corregidos

1. La validación de enlaces no comprobaba de forma efectiva que la URL fuera HTTP/HTTPS. Se agregó validación de protocolo y cobertura para enlaces mal formados; ahora se rechazan con `422` sin persistir el recurso.
2. La respuesta pública no exponía una descarga verificable para los archivos académicos. Se agregó `file.downloadUrl` y `GET /api/v1/resources/:id/download`, limitado a recursos publicados y vigentes.
3. La regresión no confirmaba referencias de archivos al eliminar contenido. Se agregó la protección `409 FILE_IN_USE` y la prueba que confirma que el archivo queda conservado al eliminar el recurso.
4. La edición no se verificaba desde la consulta pública posterior. La integración ahora confirma que el nuevo título, enlace y archivo se reflejan después del `PUT`.

Las correcciones corresponden a los commits de implementación y pruebas `9e43097`, `bd30810`, `13eda8a` y a la documentación de este flujo.

## Casos de prueba y evidencia

Los casos automatizados están en:

- `tests/integration/resource.api.database.test.ts`: CRUD, sustitución, enlaces inválidos, contenido vacío, consulta pública posterior, estados, permisos y sesión expirada.
- `tests/integration/file.api.database.test.ts`: carga multipart, MIME inválido, persistencia física, descarga pública, `FILE_IN_USE`, eliminación y preservación posterior.
- `../../aequvg-frontend/tests/e2e/public-site.spec.ts`: catálogo público, descarga, validación visible, edición, sustitución, confirmación y eliminación administrativa.

La ejecución reproducible y sus resultados actuales están registrados en [`resources-admin-evidence.md`](resources-admin-evidence.md).
