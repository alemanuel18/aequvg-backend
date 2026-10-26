# Comentarios e historial personal (S4-COM)

## Contrato

Los comentarios pertenecen a una noticia (`NOTICIA`), un proyecto aprobado (`PROYECTO`) o un evento publicado (`EVENTO`). El backend confirma la visibilidad actual del destino antes de aceptar o listar sus comentarios; destinos inexistentes, no aprobados o no publicados responden `404 PUBLICATION_NOT_FOUND`.

| Método | Ruta | Acceso |
| --- | --- | --- |
| `GET` | `/api/v1/publications/:targetType/:targetId/comments?page=1&pageSize=20` | Público; solo destino visible |
| `POST` | `/api/v1/publications/:targetType/:targetId/comments` | Sesión estudiantil activa y `X-CSRF-Token` |
| `GET` | `/api/v1/student-auth/me/comments?page=1&pageSize=20` | Sesión estudiantil activa |
| `PUT` | `/api/v1/student-auth/me/comments/:id` | Autor del comentario, sesión activa y `X-CSRF-Token` |
| `DELETE` | `/api/v1/student-auth/me/comments/:id` | Autor del comentario, sesión activa y `X-CSRF-Token` |
| `GET` | `/api/v1/admin/comments/history?page=1&pageSize=20` | Administrador (`ADMIN_ACCESS`) |

El cuerpo de creación contiene solo `{ "content": "..." }`. El servidor obtiene el autor de la sesión, normaliza Unicode NFC, recorta espacios laterales y admite de 1 a 2000 caracteres. El historial se ordena por fecha descendente y usa páginas de 1 a 100 elementos. Las respuestas no exponen correo ni otros datos de cuenta.

Un hash SHA-256 compuesto por autor, destino y texto normalizado permite que PostgreSQL rechace de forma atómica un texto duplicado por el mismo autor en el mismo destino (`409 DUPLICATE_COMMENT`). La moderación se ejecuta después de validar la publicación y antes de persistir; un rechazo responde `422 COMMENT_REJECTED_BY_MODERATION`.

Cada edición vuelve a ejecutar moderación sobre el texto nuevo antes de guardar. Solo el autor puede editar o eliminar un comentario; una edición idéntica no crea una revisión. El borrado es lógico: el comentario sale de las listas públicas y del historial personal, mientras la revisión con texto anterior queda disponible únicamente en la ruta administrativa. Las revisiones son de solo lectura y no se incluyen en respuestas públicas o estudiantiles.

## Moderación y renderizado seguro

El módulo central `moderation` expone `moderationService.isCommentAllowed` como proveedor para los módulos que publican texto. `comments` consulta ese proveedor antes de guardar. Su implementación predeterminada es una política léxica interna: normaliza Unicode, tildes, mayúsculas y separadores, y rechaza como palabra completa insultos directos configurados en español e inglés. No hay un proveedor externo configurado; el contrato `registerCommentProvider` permite conectar uno cuando exista una decisión del equipo. La política es independiente del filtro de nombres.

El filtro es una primera barrera: no interpreta contexto, ironía o amenazas implícitas y no detecta contenido abusivo fuera de su lista. Si no hay moderador disponible, la operación falla de forma segura con `503 COMMENT_MODERATION_UNAVAILABLE`; si el texto es rechazado responde `422 COMMENT_REJECTED_BY_MODERATION`.

El API conserva el comentario como texto plano, sin interpretarlo como HTML. Los clientes deben renderizar `content` mediante interpolación/texto escapado (por ejemplo, `{{ comment.content }}` en Vue) y nunca con `v-html` o `innerHTML`.

La regla de longitud, la deduplicación exacta por autor/destino y el alcance de destinos son decisiones iniciales de esta implementación; deben confirmarse con el equipo S4 si existe otro criterio aprobado.

## Anonimización del autor

La baja propia anonimiza los comentarios dentro de la misma transacción que elimina la cuenta lógicamente y revoca sus sesiones. Se limpia `id_estudiante` y se rota el hash de deduplicación; se conservan el comentario, su destino y `creado_en`. Los eventos de auditoría también conservan su fecha y contenido anterior, pero no exponen al público ni mantienen la cuenta como actor después de su anonimización. El historial personal previo deja de asociarse a la cuenta y las listas públicas muestran `Anónimo`.

La API entrega el contenido como texto plano. El cliente debe representarlo con interpolación/texto escapado (por ejemplo, `{{ comment.content }}` en Vue) y nunca interpretarlo como HTML (`v-html`).

## Evidencia automatizada

- Unitarias: política central MOD, moderación antes de persistir, rechazo cuando MOD no está disponible o rechaza, destino visible, historial paginado y límites.
- Contrato HTTP: rutas documentadas en OpenAPI y autenticación requerida para el historial propio.
- Persistencia: migración con destino único, claves foráneas, autor anulable, índice único de duplicados e índices de consulta. La baja conserva texto, publicación y fecha, elimina la asociación del autor y rota la clave de deduplicación.

La migración requiere PostgreSQL actualizado con `bun run migrate:deploy` en un entorno de prueba; no ejecutar sobre producción como parte de esta tarea.
