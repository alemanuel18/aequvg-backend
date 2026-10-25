import { Elysia } from 'elysia'
import { enforceRateLimit } from '../../../middleware/rate-limit'
import { requireAdmin } from '../../../middleware/admin'
import { studentAuthService } from '../../users/services/student-auth.service'
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
    detail: { tags: ['Comentarios'], summary: 'Lista comentarios de una publicación visible', description: 'Los comentarios se devuelven como texto plano. Solo se admiten noticias publicadas, proyectos aprobados y eventos publicados.' }
  })
  .post('/publications/:targetType/:targetId/comments', async ({ params, body, request, set }) => {
    const authenticated = await studentAuthService.authenticate(request)
    enforceRateLimit(`student-${authenticated.user.id}`)
    set.status = 201
    return commentsService.create(authenticated.user.id, params.targetType, params.targetId, body)
  }, {
    params: commentTargetParams,
    body: commentBody,
    response: { 201: commentResponse, 401: commentErrorResponse, 403: commentErrorResponse, 404: commentErrorResponse, 409: commentErrorResponse, 422: commentErrorResponse, 429: commentErrorResponse, 503: commentErrorResponse },
    detail: { tags: ['Comentarios'], summary: 'Publica un comentario con la identidad de sesión estudiantil', description: 'Requiere sesión activa y CSRF. El autor nunca se acepta en el cuerpo y la moderación se ejecuta antes de guardar.' }
  })
  .put('/student-auth/me/comments/:id', async ({ params, body, request }) => {
    const authenticated = await studentAuthService.authenticate(request)
    enforceRateLimit(`student-${authenticated.user.id}`)
    return commentsService.updateOwn(authenticated.user.id, params.id, body)
  }, {
    params: commentIdParams,
    body: commentBody,
    response: { 200: commentResponse, 401: commentErrorResponse, 403: commentErrorResponse, 404: commentErrorResponse, 409: commentErrorResponse, 422: commentErrorResponse, 429: commentErrorResponse, 503: commentErrorResponse },
    detail: { tags: ['Comentarios'], summary: 'Edita un comentario propio', description: 'Requiere sesión estudiantil activa y CSRF. El texto nuevo pasa por moderación antes de cualquier cambio.' }
  })
  .delete('/student-auth/me/comments/:id', async ({ params, request }) => {
    const authenticated = await studentAuthService.authenticate(request)
    enforceRateLimit(`student-${authenticated.user.id}`)
    return commentsService.deleteOwn(authenticated.user.id, params.id)
  }, {
    params: commentIdParams,
    response: { 200: commentDeleteResponse, 401: commentErrorResponse, 403: commentErrorResponse, 404: commentErrorResponse, 429: commentErrorResponse, 503: commentErrorResponse },
    detail: { tags: ['Comentarios'], summary: 'Elimina un comentario propio', description: 'El comentario deja de ser público. El cambio se conserva en el historial administrativo.' }
  })
  .get('/student-auth/me/comments', async ({ request, query }) => {
    const authenticated = await studentAuthService.authenticate(request)
    const { page, pageSize } = pagination(query)
    return commentsService.byStudent(authenticated.user.id, page, pageSize)
  }, {
    query: commentPagination,
    response: { 200: commentListResponse, 401: commentErrorResponse, 403: commentErrorResponse, 422: commentErrorResponse, 503: commentErrorResponse },
    detail: { tags: ['Comentarios'], summary: 'Lista el historial paginado de comentarios del estudiante actual' }
  })
  .get('/admin/comments/history', async ({ request, query }) => {
    await requireAdmin(request, 'ADMIN_ACCESS')
    const { page, pageSize } = pagination(query)
    return commentsService.adminHistory(page, pageSize)
  }, {
    query: commentPagination,
    response: { 200: commentRevisionListResponse, 401: commentErrorResponse, 403: commentErrorResponse, 422: commentErrorResponse },
    detail: { tags: ['Administración'], summary: 'Consulta el historial de edición y eliminación de comentarios', description: 'Solo administradores pueden consultar contenido anterior o eliminado.' }
  })
