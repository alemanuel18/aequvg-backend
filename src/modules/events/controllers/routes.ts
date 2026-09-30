import { Elysia } from 'elysia'
import { requireAdmin } from '../../../middleware/admin'
import { enforceRateLimit } from '../../../middleware/rate-limit'
import {
  eventAdminQuery,
  eventCreateBody,
  eventErrorResponse,
  eventListResponse,
  eventPublicListResponse,
  eventPublicQuery,
  eventPublicResponse,
  eventRegistrationAdminListResponse,
  eventRegistrationAdminQuery,
  eventRegistrationBody,
  eventRegistrationResponse,
  eventResponse,
  eventUpdateBody,
  idParams
} from '../dtos/schemas'
import { eventRegistrationsService } from '../services/event-registrations.service'
import { eventsService } from '../services/events.service'

export const eventsRoutes = new Elysia({ prefix: '/api/v1' })
  .get('/events', ({ query }) => eventsService.publicList(query), {
    query: eventPublicQuery,
    response: { 200: eventPublicListResponse, 503: eventErrorResponse },
    detail: { tags: ['Eventos'], summary: 'Busca eventos públicos activos', description: 'Busca por texto y pagina únicamente eventos en estado PUBLICADO.' }
  })
  .get('/events/:id', ({ params }) => eventsService.publicById(params.id), {
    params: idParams,
    response: { 200: eventPublicResponse, 404: eventErrorResponse, 503: eventErrorResponse },
    detail: { tags: ['Eventos'], summary: 'Consulta un evento público activo', description: 'Devuelve información pública de eventos con estado PUBLICADO. Eventos no publicados o inexistentes devuelven 404.' }
  })
  .post('/events/:id/registrations', ({ headers, params, body, set }) => {
    enforceRateLimit(headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown')
    set.status = 201
    return eventRegistrationsService.register(params.id, body)
  }, {
    params: idParams,
    body: eventRegistrationBody,
    response: {
      201: eventRegistrationResponse,
      400: eventErrorResponse,
      404: eventErrorResponse,
      409: eventErrorResponse,
      422: eventErrorResponse,
      429: eventErrorResponse,
      503: eventErrorResponse
    },
    detail: {
      tags: ['Eventos'],
      summary: 'Inscribe un participante a un evento público',
      description: 'Inscripción pública con control atómico de cupos y aceptación de política de privacidad.'
    }
  })
  .get('/admin/events', async ({ request, query }) => {
    await requireAdmin(request, 'EVENTS_MANAGE')
    return eventsService.adminList(query)
  }, {
    query: eventAdminQuery,
    response: { 200: eventListResponse, 401: eventErrorResponse, 503: eventErrorResponse },
    detail: { tags: ['Administración'], summary: 'Busca eventos administrativos', description: 'Incluye todos los estados. Requiere una sesión con EVENTS_MANAGE.' }
  })
  .get('/admin/events/:id', async ({ request, params }) => {
    await requireAdmin(request, 'EVENTS_MANAGE')
    return eventsService.adminById(params.id)
  }, {
    params: idParams,
    response: { 200: eventResponse, 401: eventErrorResponse, 404: eventErrorResponse, 503: eventErrorResponse },
    detail: { tags: ['Administración'], summary: 'Consulta un evento administrativo', description: 'Devuelve un evento administrativo por ID independientemente de su estado. Requiere una sesión con EVENTS_MANAGE.' }
  })
  .get('/admin/events/:id/registrations', async ({ request, params, query }) => {
    await requireAdmin(request, 'EVENTS_MANAGE')
    return eventRegistrationsService.adminList(params.id, query)
  }, {
    params: idParams,
    query: eventRegistrationAdminQuery,
    response: {
      200: eventRegistrationAdminListResponse,
      401: eventErrorResponse,
      404: eventErrorResponse,
      422: eventErrorResponse,
      503: eventErrorResponse
    },
    detail: {
      tags: ['Administración'],
      summary: 'Consulta participantes de un evento',
      description: 'Lista paginada de inscripciones con PII operativa. Requiere una sesión con EVENTS_MANAGE.'
    }
  })
  .post('/admin/events', async ({ request, body, set }) => {
    const authenticated = await requireAdmin(request, 'EVENTS_MANAGE')
    set.status = 201
    return eventsService.create({ ...body, createdById: authenticated.user.id })
  }, {
    body: eventCreateBody,
    response: { 201: eventResponse, 401: eventErrorResponse, 422: eventErrorResponse, 503: eventErrorResponse },
    detail: { tags: ['Administración'], summary: 'Crea un evento', description: 'Crea un evento administrativo con estado inicial BORRADOR por defecto.' }
  })
  .put('/admin/events/:id', async ({ request, params, body }) => {
    await requireAdmin(request, 'EVENTS_MANAGE')
    return eventsService.update(params.id, body)
  }, {
    params: idParams,
    body: eventUpdateBody,
    response: { 200: eventResponse, 401: eventErrorResponse, 404: eventErrorResponse, 422: eventErrorResponse, 503: eventErrorResponse },
    detail: { tags: ['Administración'], summary: 'Actualiza un evento', description: 'Actualiza los campos editables de un evento existente.' }
  })
  .patch('/admin/events/:id/archive', async ({ request, params }) => {
    await requireAdmin(request, 'EVENTS_MANAGE')
    return eventsService.archive(params.id)
  }, {
    params: idParams,
    response: { 200: eventResponse, 401: eventErrorResponse, 404: eventErrorResponse, 503: eventErrorResponse },
    detail: { tags: ['Administración'], summary: 'Archiva un evento', description: 'Retira el evento de la consulta sin eliminar el registro.' }
  })
  .delete('/admin/events/:id', async ({ request, params }) => {
    await requireAdmin(request, 'EVENTS_MANAGE')
    return eventsService.remove(params.id)
  }, {
    params: idParams,
    response: { 200: eventResponse, 401: eventErrorResponse, 404: eventErrorResponse, 409: eventErrorResponse, 503: eventErrorResponse },
    detail: { tags: ['Administración'], summary: 'Elimina un evento', description: 'Elimina físicamente un evento que no posee inscripciones registradas.' }
  })
