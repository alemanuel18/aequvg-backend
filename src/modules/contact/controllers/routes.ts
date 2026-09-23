import { Elysia, t } from 'elysia'
import { requireAdmin } from '../../../middleware/admin'
import { enforceRateLimit } from '../../../middleware/rate-limit'
import { contactMethodBody, contactRequestBody } from '../dtos/schemas'
import { contactService } from '../services/contact.service'

export const contactRoutes = new Elysia({ prefix: '/api/v1' })
  .get('/contact-methods', () => contactService.publicMethods(), { detail: { tags: ['Contacto'], summary: 'Consulta medios oficiales activos' } })
  .post('/contact-requests', ({ body, headers, set }) => { enforceRateLimit(headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'); set.status = 201; return contactService.createRequest(body) }, { body: contactRequestBody, detail: { tags: ['Contacto'], summary: 'Envía una consulta o solicitud de reunión' } })
  .get('/admin/contact-methods', ({ headers }) => { requireAdmin(headers.authorization); return contactService.allMethods() }, { detail: { tags: ['Administración'] } })
  .post('/admin/contact-methods', ({ headers, body, set }) => { requireAdmin(headers.authorization); set.status = 201; return contactService.createMethod(body) }, { body: contactMethodBody, detail: { tags: ['Administración'] } })
  .put('/admin/contact-methods/:id', ({ headers, params, body }) => { requireAdmin(headers.authorization); return contactService.updateMethod(Number(params.id), body) }, { params: t.Object({ id: t.Numeric() }), body: contactMethodBody, detail: { tags: ['Administración'] } })
  .delete('/admin/contact-methods/:id', ({ headers, params }) => { requireAdmin(headers.authorization); return contactService.deactivateMethod(Number(params.id)) }, { params: t.Object({ id: t.Numeric() }), detail: { tags: ['Administración'] } })
  .get('/admin/contact-requests', ({ headers, query }) => { requireAdmin(headers.authorization); return contactService.listRequests(Number(query.page ?? 1), Number(query.pageSize ?? 20)) }, { query: t.Object({ page: t.Optional(t.Numeric({ minimum: 1 })), pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })) }), detail: { tags: ['Administración'] } })
  .put('/admin/contact-requests/:id', ({ headers, params, body }) => { requireAdmin(headers.authorization); return contactService.updateRequest(Number(params.id), body.status, body.assignedToId) }, { params: t.Object({ id: t.Numeric() }), body: t.Object({ status: t.Union([t.Literal('PENDIENTE'), t.Literal('EN_PROCESO'), t.Literal('ATENDIDA'), t.Literal('ARCHIVADA')]), assignedToId: t.Optional(t.Nullable(t.Integer({ minimum: 1 }))) }), detail: { tags: ['Administración'] } })
