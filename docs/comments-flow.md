# Comentarios e historial personal (S4-COM)

## Contrato

Los comentarios pertenecen a una noticia (`NOTICIA`), un proyecto aprobado (`PROYECTO`) o un evento publicado (`EVENTO`). El backend confirma la visibilidad actual del destino antes de aceptar o listar sus comentarios; destinos inexistentes, no aprobados o no publicados responden `404 PUBLICATION_NOT_FOUND`.

| Método | Ruta | Acceso |
| --- | --- | --- |
| `GET` | `/api/v1/publications/:targetType/:targetId/comments?page=1&pageSize=20` | Público; solo destino visible |
| `POST` | `/api/v1/publications/:targetType/:targetId/comments` | Sesión estudiantil activa y `X-CSRF-Token` |
| `GET` | `/api/v1/student-auth/me/comments?page=1&pageSize=20` | Sesión estudiantil activa |

El cuerpo de creación contiene solo `{ "content": "..." }`. El servidor obtiene el autor de la sesión, normaliza Unicode NFC, recorta espacios laterales y admite de 1 a 2000 caracteres. El historial se ordena por fecha descendente y usa páginas de 1 a 100 elementos. Las respuestas no exponen correo ni otros datos de cuenta.

Un hash SHA-256 compuesto por autor, destino y texto normalizado permite que PostgreSQL rechace de forma atómica un texto duplicado por el mismo autor en el mismo destino (`409 DUPLICATE_COMMENT`). La moderación se ejecuta después de validar la publicación y antes de persistir; un rechazo responde `422 COMMENT_REJECTED_BY_MODERATION`.

## Integración MOD pendiente

El repositorio no contiene un moderador para texto libre ni una política aprobada de comentarios. El servicio define el contrato `CommentModerator` y falla de forma cerrada con `503 COMMENT_MODERATION_UNAVAILABLE` hasta que el módulo MOD registre su política aprobada mediante `commentModerationService.register`. No se reutiliza el filtro de nombres, porque no define moderación de comentarios. Por lo tanto, el endpoint de creación no publicará comentarios en un entorno donde MOD todavía no esté conectado.

La regla de longitud, la deduplicación exacta por autor/destino y el alcance de destinos son decisiones iniciales de esta implementación; deben confirmarse con el equipo S4 si existe otro criterio aprobado.

## Anonimización y renderizado

La baja propia anonimiza los comentarios dentro de la misma transacción que elimina la cuenta lógicamente y revoca sus sesiones. Se limpia `id_estudiante` y se rota el hash de deduplicación; se conservan el comentario, su destino y `creado_en`. El historial personal previo deja de asociarse a la cuenta y las listas públicas muestran `Anónimo`.

La API entrega el contenido como texto plano. El cliente debe representarlo con interpolación/texto escapado (por ejemplo, `{{ comment.content }}` en Vue) y nunca interpretarlo como HTML (`v-html`).

## Evidencia automatizada

- Unitarias: moderación antes de persistir, rechazo cuando MOD no está disponible o rechaza, destino visible, historial paginado y límites.
- Contrato HTTP: rutas documentadas en OpenAPI y autenticación requerida para el historial propio.
- Persistencia: migración con destino único, claves foráneas, autor anulable, índice único de duplicados e índices de consulta.

La migración requiere PostgreSQL actualizado con `bun run migrate:deploy` en un entorno de prueba; no ejecutar sobre producción como parte de esta tarea.
