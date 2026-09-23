import { Elysia, t } from 'elysia'
import { requireAdmin } from '../../../middleware/admin'
import { boardMemberBody } from '../dtos/schemas'
import { boardService } from '../services/board.service'

export const boardRoutes = new Elysia({ prefix: '/api/v1' })
  .get('/board-members', () => boardService.publicList(), { detail: { tags: ['Junta directiva'], summary: 'Consulta integrantes activos en orden público' } })
  .get('/admin/board-members', ({ headers }) => { requireAdmin(headers.authorization); return boardService.adminList() }, { detail: { tags: ['Administración'] } })
  .post('/admin/board-members', ({ headers, body, set }) => { requireAdmin(headers.authorization); set.status = 201; return boardService.create(body) }, { body: boardMemberBody, detail: { tags: ['Administración'] } })
  .put('/admin/board-members/:id', ({ headers, params, body }) => { requireAdmin(headers.authorization); return boardService.update(Number(params.id), body) }, { params: t.Object({ id: t.Numeric() }), body: boardMemberBody, detail: { tags: ['Administración'] } })
  .delete('/admin/board-members/:id', ({ headers, params }) => { requireAdmin(headers.authorization); return boardService.retire(Number(params.id)) }, { params: t.Object({ id: t.Numeric() }), detail: { tags: ['Administración'], summary: 'Retira un integrante sin borrar su historial' } })
  .put('/admin/board-members/order', ({ headers, body }) => { requireAdmin(headers.authorization); return boardService.reorder(body.items) }, { body: t.Object({ items: t.Array(t.Object({ id: t.Integer({ minimum: 1 }), displayOrder: t.Integer({ minimum: 0 }) }), { minItems: 1 }) }), detail: { tags: ['Administración'] } })
