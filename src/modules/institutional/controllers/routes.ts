import { Elysia, t } from 'elysia'
import { requireAdmin } from '../../../middleware/admin'
import { blockBody } from '../dtos/schemas'
import { institutionalService } from '../services/institutional.service'

export const institutionalRoutes = new Elysia({ prefix: '/api/v1' })
  .get('/institutional-content', () => institutionalService.publicList(), { detail: { tags: ['Contenido institucional'], summary: 'Consulta los bloques institucionales publicados' } })
  .get('/admin/institutional-content', async ({ request }) => { await requireAdmin(request, 'INSTITUTIONAL_MANAGE'); return institutionalService.adminList() }, { detail: { tags: ['Administración'], summary: 'Lista todos los bloques institucionales' } })
  .post('/admin/institutional-content', async ({ request, body, set }) => { await requireAdmin(request, 'INSTITUTIONAL_MANAGE'); set.status = 201; return institutionalService.create(body) }, { body: blockBody, detail: { tags: ['Administración'], summary: 'Crea un bloque institucional' } })
  .put('/admin/institutional-content/:id', async ({ request, params, body }) => { await requireAdmin(request, 'INSTITUTIONAL_MANAGE'); return institutionalService.update(Number(params.id), body) }, { params: t.Object({ id: t.Numeric() }), body: blockBody, detail: { tags: ['Administración'], summary: 'Actualiza un bloque institucional' } })
  .delete('/admin/institutional-content/:id', async ({ request, params }) => { await requireAdmin(request, 'INSTITUTIONAL_MANAGE'); return institutionalService.archive(Number(params.id)) }, { params: t.Object({ id: t.Numeric() }), detail: { tags: ['Administración'], summary: 'Archiva un bloque institucional' } })
