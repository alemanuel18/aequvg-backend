import { Elysia, t } from 'elysia'
import { requireAdmin } from '../../../middleware/admin'
import { newsAdminQuery, newsCategoryListResponse, newsCreateBody, newsErrorResponse, newsListResponse, newsPublicQuery, newsResponse, newsUpdateBody } from '../dtos/schemas'
import { newsService } from '../services/news.service'

const idParams = t.Object({ id: t.Integer({ minimum: 1 }) })

export const newsRoutes = new Elysia({ prefix: '/api/v1' })
  .get('/news/categories', () => newsService.activeCategories(), {
    response: { 200: newsCategoryListResponse },
    detail: { tags: ['Noticias'], summary: 'Consulta categorías activas de noticias', description: 'Devuelve únicamente categorías activas que pueden usarse al consultar publicaciones públicas.' }
  })
  .get('/news', ({ query }) => newsService.publicList(query), {
    query: newsPublicQuery,
    response: { 200: newsListResponse },
    detail: { tags: ['Noticias'], summary: 'Busca publicaciones activas', description: 'Busca por texto, filtra por categoría y pagina únicamente noticias PUBLICADO cuya fecha de publicación ya llegó.' }
  })
  .get('/news/:id', ({ params }) => newsService.publicById(params.id), {
    params: idParams,
    response: { 200: newsResponse, 404: newsErrorResponse },
    detail: { tags: ['Noticias'], summary: 'Consulta una publicación activa', description: 'No expone borradores, publicaciones archivadas, programadas o de categorías inactivas.' }
  })
  .get('/admin/news', ({ headers, query }) => { requireAdmin(headers.authorization); return newsService.adminList(query) }, {
    query: newsAdminQuery,
    response: { 200: newsListResponse, 401: newsErrorResponse, 503: newsErrorResponse },
    detail: { tags: ['Administración'], summary: 'Busca noticias administrativas', description: 'Incluye todos los estados. Requiere Authorization: Bearer <ADMIN_API_KEY>.' }
  })
  .get('/admin/news/:id', ({ headers, params }) => { requireAdmin(headers.authorization); return newsService.adminById(params.id) }, {
    params: idParams,
    response: { 200: newsResponse, 401: newsErrorResponse, 404: newsErrorResponse, 503: newsErrorResponse },
    detail: { tags: ['Administración'], summary: 'Consulta una noticia administrativa' }
  })
  .post('/admin/news', ({ headers, body, set }) => { requireAdmin(headers.authorization); set.status = 201; return newsService.create(body) }, {
    body: newsCreateBody,
    response: { 201: newsResponse, 401: newsErrorResponse, 422: newsErrorResponse, 503: newsErrorResponse },
    detail: { tags: ['Administración'], summary: 'Crea una noticia', description: 'Una noticia PUBLICADO recibe una fecha de publicación si no se proporciona una. Autor y categoría deben estar activos.' }
  })
  .put('/admin/news/:id', ({ headers, params, body }) => { requireAdmin(headers.authorization); return newsService.update(params.id, body) }, {
    params: idParams,
    body: newsUpdateBody,
    response: { 200: newsResponse, 401: newsErrorResponse, 404: newsErrorResponse, 422: newsErrorResponse, 503: newsErrorResponse },
    detail: { tags: ['Administración'], summary: 'Actualiza una noticia', description: 'Cambiar el estado a BORRADOR o ARCHIVADO elimina la fecha de publicación; PUBLICADO la asigna o conserva.' }
  })
  .patch('/admin/news/:id/archive', ({ headers, params }) => { requireAdmin(headers.authorization); return newsService.archive(params.id) }, {
    params: idParams,
    response: { 200: newsResponse, 401: newsErrorResponse, 404: newsErrorResponse, 503: newsErrorResponse },
    detail: { tags: ['Administración'], summary: 'Archiva una noticia', description: 'Retira la noticia de la consulta pública sin eliminar el registro.' }
  })
  .delete('/admin/news/:id', ({ headers, params }) => { requireAdmin(headers.authorization); return newsService.remove(params.id) }, {
    params: idParams,
    response: { 200: newsResponse, 401: newsErrorResponse, 404: newsErrorResponse, 503: newsErrorResponse },
    detail: { tags: ['Administración'], summary: 'Elimina una noticia', description: 'Elimina permanentemente una noticia existente.' }
  })
