import { Elysia, t } from 'elysia'
import { requireAdmin } from '../../../middleware/admin'
import { newsAdminQuery, newsCreateBody, newsPublicQuery, newsUpdateBody } from '../dtos/schemas'
import { newsService } from '../services/news.service'

const idParams = t.Object({ id: t.Integer({ minimum: 1 }) })

export const newsRoutes = new Elysia({ prefix: '/api/v1' })
  .get('/news/categories', () => newsService.activeCategories(), { detail: { tags: ['Noticias'], summary: 'Consulta categorías activas de noticias' } })
  .get('/news', ({ query }) => newsService.publicList(query), { query: newsPublicQuery, detail: { tags: ['Noticias'], summary: 'Busca publicaciones activas' } })
  .get('/news/:id', ({ params }) => newsService.publicById(params.id), { params: idParams, detail: { tags: ['Noticias'], summary: 'Consulta una publicación activa' } })
  .get('/admin/news', ({ headers, query }) => { requireAdmin(headers.authorization); return newsService.adminList(query) }, { query: newsAdminQuery, detail: { tags: ['Administración'], summary: 'Busca noticias administrativas' } })
  .get('/admin/news/:id', ({ headers, params }) => { requireAdmin(headers.authorization); return newsService.adminById(params.id) }, { params: idParams, detail: { tags: ['Administración'] } })
  .post('/admin/news', ({ headers, body, set }) => { requireAdmin(headers.authorization); set.status = 201; return newsService.create(body) }, { body: newsCreateBody, detail: { tags: ['Administración'], summary: 'Crea una noticia' } })
  .put('/admin/news/:id', ({ headers, params, body }) => { requireAdmin(headers.authorization); return newsService.update(params.id, body) }, { params: idParams, body: newsUpdateBody, detail: { tags: ['Administración'], summary: 'Actualiza una noticia' } })
  .patch('/admin/news/:id/archive', ({ headers, params }) => { requireAdmin(headers.authorization); return newsService.archive(params.id) }, { params: idParams, detail: { tags: ['Administración'], summary: 'Archiva una noticia' } })
  .delete('/admin/news/:id', ({ headers, params }) => { requireAdmin(headers.authorization); return newsService.remove(params.id) }, { params: idParams, detail: { tags: ['Administración'], summary: 'Elimina una noticia' } })
