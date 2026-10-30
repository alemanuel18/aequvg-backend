import { Elysia } from 'elysia'
import { enforceRateLimit } from '../../../middleware/rate-limit'
import { requireAdmin } from '../../../middleware/admin'
import { studentAuthService } from '../../users/services/student-auth.service'
import { moderationIdempotencyHeaders, moderationIdempotencyParameter, requireModerationIdempotencyKey } from '../../moderation/dtos/schemas'
import { commentBody, commentDeleteResponse, commentErrorResponse, commentIdParams, commentListResponse, commentPagination, commentResponse, commentRevisionListResponse, commentTargetParams } from '../dtos/schemas'
import { commentsService } from '../services/comments.service'

const pagination = (query: { page?: number; pageSize?: number }) => ({ page: query.page ?? 1, pageSize: query.pageSize ?? 20 })

export const commentsRoutes = new Elysia({ prefix: '/api/v1' })
  .get('/publications/:targetType/:targetId/comments', ({ params, query }) => {
    const { page, pageSize } = pagination(query)
    return commentsService.byPublication(params.targetType, params.targetId, page, pageSize)
  }, {
    params: commentTargetParams,
    query: commentPagination,
    response: { 200: commentListResponse, 404: commentErrorResponse, 422: commentErrorResponse, 503: commentErrorResponse },
    detail: { tags: ['Comentarios'], summary: 'Lista comentarios de una publicación visible', description: 'Tipos habilitados en S4: NOTICIA publicada, registro PROYECTO de tipo PROYECTO aprobado (TESIS excluida) y EVENTO publicado. La respuesta pagina items con page, pageSize y total; content es texto plano y debe renderizarse escapado. Destinos retirados, inexistentes o no visibles responden 404 PUBLICATION_NOT_FOUND.' }
  })
  .post('/publications/:targetType/:targetId/comments', async ({ params, body, request, set }) => {
    const authenticated = await studentAuthService.authenticate(request)
    enforceRateLimit(`student-${authenticated.user.id}`)
    set.status = 201
    return commentsService.create(authenticated.user.id, params.targetType, params.targetId, body, requireModerationIdempotencyKey(request.headers.get('idempotency-key')))
  }, {
    params: commentTargetParams,
    headers: moderationIdempotencyHeaders,
    body: commentBody,
    response: { 201: commentResponse, 401: commentErrorResponse, 403: commentErrorResponse, 404: commentErrorResponse, 409: commentErrorResponse, 422: commentErrorResponse, 429: commentErrorResponse, 503: commentErrorResponse },
    detail: { tags: ['Comentarios'], summary: 'Publica un comentario con la identidad de sesión estudiantil', description: 'Admite NOTICIA publicada, registro PROYECTO de tipo PROYECTO aprobado (TESIS excluida) o EVENTO publicado. Requiere cuenta estudiantil activa, cookie de sesión, X-CSRF-Token e Idempotency-Key requerido. El cliente conserva la clave al reintentar exactamente el mismo contenido y genera otra al editarlo. El cuerpo contiene content (texto plano, 1–2000 caracteres); cualquier identidad de autor enviada se ignora y el autor siempre se deriva de la sesión. MOD evalúa el texto antes de persistir. Errores: 401 sin sesión, 403 cuenta bloqueada/CSRF inválido, 404 destino no visible, 409 duplicado, 422 validación/rechazo MOD o clave inválida/faltante, 429 límite y 503 MOD no disponible.', security: [{ studentCookieAuth: [], csrfToken: [] }], parameters: [moderationIdempotencyParameter] }
  })
  .put('/student-auth/me/comments/:id', async ({ params, body, request }) => {
    const authenticated = await studentAuthService.authenticate(request)
    enforceRateLimit(`student-${authenticated.user.id}`)
    return commentsService.updateOwn(authenticated.user.id, params.id, body, requireModerationIdempotencyKey(request.headers.get('idempotency-key')))
  }, {
    params: commentIdParams,
    headers: moderationIdempotencyHeaders,
    body: commentBody,
    response: { 200: commentResponse, 401: commentErrorResponse, 403: commentErrorResponse, 404: commentErrorResponse, 409: commentErrorResponse, 422: commentErrorResponse, 429: commentErrorResponse, 503: commentErrorResponse },
    detail: { tags: ['Comentarios'], summary: 'Edita un comentario propio', description: 'Requiere sesión estudiantil activa, X-CSRF-Token e Idempotency-Key requerido, reutilizado al reintentar el mismo contenido. Solo edita el autor autenticado; el texto nuevo vuelve a pasar por MOD antes de persistir. Un duplicado responde 409, texto rechazado o clave inválida/faltante 422 y comentario ajeno o inexistente 404.', security: [{ studentCookieAuth: [], csrfToken: [] }], parameters: [moderationIdempotencyParameter] }
  })
  .delete('/student-auth/me/comments/:id', async ({ params, request }) => {
    const authenticated = await studentAuthService.authenticate(request)
    enforceRateLimit(`student-${authenticated.user.id}`)
    return commentsService.deleteOwn(authenticated.user.id, params.id)
  }, {
    params: commentIdParams,
    response: { 200: commentDeleteResponse, 401: commentErrorResponse, 403: commentErrorResponse, 404: commentErrorResponse, 429: commentErrorResponse, 503: commentErrorResponse },
    detail: { tags: ['Comentarios'], summary: 'Elimina un comentario propio', description: 'Requiere sesión estudiantil activa y X-CSRF-Token; solo el autor puede retirar el comentario. La baja es lógica: sale de listas públicas e historial personal y deja una revisión solo visible para administración.', security: [{ studentCookieAuth: [], csrfToken: [] }] }
  })
  .get('/student-auth/me/comments', async ({ request, query }) => {
    const authenticated = await studentAuthService.authenticate(request)
    const { page, pageSize } = pagination(query)
    return commentsService.byStudent(authenticated.user.id, page, pageSize)
  }, {
    query: commentPagination,
    response: { 200: commentListResponse, 401: commentErrorResponse, 403: commentErrorResponse, 422: commentErrorResponse, 503: commentErrorResponse },
    detail: { tags: ['Comentarios'], summary: 'Lista el historial paginado de comentarios del estudiante actual', description: 'Requiere una sesión estudiantil activa. El actor se obtiene de la sesión y no hay parámetro para consultar el historial de otra cuenta. page inicia en 1; pageSize admite 1–100. Una cuenta bloqueada o eliminada recibe 403.', security: [{ studentCookieAuth: [] }] }
  })
  .get('/admin/comments/history', async ({ request, query }) => {
    await requireAdmin(request, 'ADMIN_ACCESS')
    const { page, pageSize } = pagination(query)
    return commentsService.adminHistory(page, pageSize)
  }, {
    query: commentPagination,
    response: { 200: commentRevisionListResponse, 401: commentErrorResponse, 403: commentErrorResponse, 422: commentErrorResponse },
    detail: { tags: ['Administración'], summary: 'Consulta el historial de edición y eliminación de comentarios', description: 'Requiere administrador con ADMIN_ACCESS. Devuelve auditoría paginada de ediciones y retiros, incluyendo texto anterior y acción. No forma parte del historial personal público.', security: [{ cookieAuth: [] }] }
  })
