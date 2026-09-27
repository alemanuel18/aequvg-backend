import { Elysia, t } from 'elysia'
import { requireAdmin } from '../../../middleware/admin'
import { resourceAdminQuery, resourceCategoryListResponse, resourceCreateBody, resourceErrorResponse, resourceListResponse, resourcePublicQuery, resourceResponse, resourceUpdateBody } from '../dtos/schemas'
import { resourceService } from '../services/resource.service'

const idParams = t.Object({ id: t.Integer({ minimum: 1 }) })

export const resourceRoutes = new Elysia({ prefix: '/api/v1' })
  .get('/resources/categories', () => resourceService.activeCategories(), {
    response: { 200: resourceCategoryListResponse },
    detail: { tags: ['Recursos'], summary: 'Consulta categorías activas de recursos' }
  })
  .get('/resources', ({ query }) => resourceService.publicList(query), {
    query: resourcePublicQuery, response: { 200: resourceListResponse },
    detail: { tags: ['Recursos'], summary: 'Busca recursos publicados', description: 'Busca por texto o categoría y pagina únicamente recursos PUBLICADO cuya fecha ya llegó.' }
  })
  .get('/resources/:id', ({ params }) => resourceService.publicById(params.id), {
    params: idParams, response: { 200: resourceResponse, 404: resourceErrorResponse },
    detail: { tags: ['Recursos'], summary: 'Consulta un recurso publicado' }
  })
  .get('/admin/resources', ({ headers, query }) => { requireAdmin(headers.authorization); return resourceService.adminList(query) }, {
    query: resourceAdminQuery, response: { 200: resourceListResponse, 401: resourceErrorResponse, 503: resourceErrorResponse },
    detail: { tags: ['Administración'], summary: 'Lista recursos administrativos' }
  })
  .get('/admin/resources/:id', ({ headers, params }) => { requireAdmin(headers.authorization); return resourceService.adminById(params.id) }, {
    params: idParams, response: { 200: resourceResponse, 401: resourceErrorResponse, 404: resourceErrorResponse, 503: resourceErrorResponse },
    detail: { tags: ['Administración'], summary: 'Consulta un recurso administrativo' }
  })
  .post('/admin/resources', ({ headers, body, set }) => { requireAdmin(headers.authorization); set.status = 201; return resourceService.create(body) }, {
    body: resourceCreateBody, response: { 201: resourceResponse, 401: resourceErrorResponse, 422: resourceErrorResponse, 503: resourceErrorResponse },
    detail: { tags: ['Administración'], summary: 'Crea un recurso', description: 'Un recurso PUBLICADO requiere un archivo o al menos un enlace.' }
  })
  .put('/admin/resources/:id', ({ headers, params, body }) => { requireAdmin(headers.authorization); return resourceService.update(params.id, body) }, {
    params: idParams, body: resourceUpdateBody, response: { 200: resourceResponse, 401: resourceErrorResponse, 404: resourceErrorResponse, 422: resourceErrorResponse, 503: resourceErrorResponse },
    detail: { tags: ['Administración'], summary: 'Actualiza un recurso', description: 'Si se envía links, reemplaza todos los enlaces del recurso.' }
  })
  .patch('/admin/resources/:id/archive', ({ headers, params }) => { requireAdmin(headers.authorization); return resourceService.archive(params.id) }, {
    params: idParams, response: { 200: resourceResponse, 401: resourceErrorResponse, 404: resourceErrorResponse, 503: resourceErrorResponse },
    detail: { tags: ['Administración'], summary: 'Archiva un recurso' }
  })
  .delete('/admin/resources/:id', ({ headers, params }) => { requireAdmin(headers.authorization); return resourceService.remove(params.id) }, {
    params: idParams, response: { 200: resourceResponse, 401: resourceErrorResponse, 404: resourceErrorResponse, 503: resourceErrorResponse },
    detail: { tags: ['Administración'], summary: 'Elimina un recurso' }
  })
