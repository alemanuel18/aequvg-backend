import { Elysia, t } from 'elysia'
import { requireAdmin } from '../../../middleware/admin'
import { enforceRateLimit } from '../../../middleware/rate-limit'
import { contactMethodBody, contactMethodOrderBody, contactRequestBody } from '../dtos/schemas'
import { contactService } from '../services/contact.service'

export const contactRoutes = new Elysia({ prefix: '/api/v1' })
  .get('/contact-methods', () => contactService.publicMethods(), { detail: { tags: ['Contacto'], summary: 'Consulta medios oficiales activos' } })
  .post('/contact-requests', async ({ body, headers, set }) => { enforceRateLimit(headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'); const result = await contactService.sendRequest(body); set.status = 202; return result }, { body: contactRequestBody, detail: { tags: ['Contacto'], summary: 'Envía una consulta o solicitud de reunión al correo oficial configurado' } })
  .get('/admin/contact-methods', async ({ request }) => { await requireAdmin(request, 'CONTACT_MANAGE'); return contactService.allMethods() }, { detail: { tags: ['Administración'] } })
  .post('/admin/contact-methods', async ({ request, body, set }) => { await requireAdmin(request, 'CONTACT_MANAGE'); set.status = 201; return contactService.createMethod(body) }, { body: contactMethodBody, detail: { tags: ['Administración'] } })
  .put('/admin/contact-methods/order', async ({ request, body }) => { await requireAdmin(request, 'CONTACT_MANAGE'); return contactService.reorderMethods(body.orderedIds) }, { body: contactMethodOrderBody, detail: { tags: ['Administración'], summary: 'Guarda el orden de los medios, sin incluir ubicaciones' } })
  .put('/admin/contact-methods/:id', async ({ request, params, body }) => { await requireAdmin(request, 'CONTACT_MANAGE'); return contactService.updateMethod(Number(params.id), body) }, { params: t.Object({ id: t.Numeric() }), body: contactMethodBody, detail: { tags: ['Administración'] } })
  .delete('/admin/contact-methods/:id', async ({ request, params }) => { await requireAdmin(request, 'CONTACT_MANAGE'); return contactService.deactivateMethod(Number(params.id)) }, { params: t.Object({ id: t.Numeric() }), detail: { tags: ['Administración'] } })
