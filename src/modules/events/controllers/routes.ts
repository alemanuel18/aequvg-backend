import { Elysia } from 'elysia'
import { requireAdmin } from '../../../middleware/admin'
import {
  eventAdminQuery,
  eventCreateBody,
  eventErrorResponse,
  eventListResponse,
  eventResponse,
  eventUpdateBody,
  idParams
} from '../dtos/schemas'
import { eventsService } from '../services/events.service'

export const eventsRoutes = new Elysia({ prefix: '/api/v1' })
  .get('/admin/events', ({ headers, query }) => {
    requireAdmin(headers.authorization)
    return eventsService.adminList(query)
  }, {
    query: eventAdminQuery,
    response: { 200: eventListResponse, 401: eventErrorResponse, 503: eventErrorResponse },
    detail: { tags: ['Administración'], summary: 'Busca eventos administrativos', description: 'Incluye todos los estados. Requiere Authorization: Bearer <ADMIN_API_KEY>.' }
  })
  .get('/admin/events/:id', ({ headers, params }) => {
    requireAdmin(headers.authorization)
    return eventsService.adminById(params.id)
  }, {
    params: idParams,
    response: { 200: eventResponse, 401: eventErrorResponse, 404: eventErrorResponse, 503: eventErrorResponse },
    detail: { tags: ['Administración'], summary: 'Consulta un evento administrativo' }
  })
  .post('/admin/events', ({ headers, body, set }) => {
    requireAdmin(headers.authorization)
    set.status = 201
    return eventsService.create(body)
  }, {
    body: eventCreateBody,
    response: { 201: eventResponse, 401: eventErrorResponse, 422: eventErrorResponse, 503: eventErrorResponse },
    detail: { tags: ['Administración'], summary: 'Crea un evento', description: 'Crea un evento administrativo con estado inicial BORRADOR por defecto.' }
  })
  .put('/admin/events/:id', ({ headers, params, body }) => {
    requireAdmin(headers.authorization)
    return eventsService.update(params.id, body)
  }, {
    params: idParams,
    body: eventUpdateBody,
    response: { 200: eventResponse, 401: eventErrorResponse, 404: eventErrorResponse, 422: eventErrorResponse, 503: eventErrorResponse },
    detail: { tags: ['Administración'], summary: 'Actualiza un evento', description: 'Actualiza los campos editables de un evento existente.' }
  })
  .patch('/admin/events/:id/archive', ({ headers, params }) => {
    requireAdmin(headers.authorization)
    return eventsService.archive(params.id)
  }, {
    params: idParams,
    response: { 200: eventResponse, 401: eventErrorResponse, 404: eventErrorResponse, 503: eventErrorResponse },
    detail: { tags: ['Administración'], summary: 'Archiva un evento', description: 'Retira el evento de la consulta sin eliminar el registro.' }
  })
  .delete('/admin/events/:id', ({ headers, params }) => {
    requireAdmin(headers.authorization)
    return eventsService.remove(params.id)
  }, {
    params: idParams,
    response: { 200: eventResponse, 401: eventErrorResponse, 404: eventErrorResponse, 409: eventErrorResponse, 503: eventErrorResponse },
    detail: { tags: ['Administración'], summary: 'Elimina un evento', description: 'Elimina físicamente un evento que no posee inscripciones registradas.' }
  })
