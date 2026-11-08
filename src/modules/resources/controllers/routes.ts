import { Elysia, t } from 'elysia'
import { AppError } from '../../../shared/errors/app-error'
import { requireAdmin } from '../../../middleware/admin'
import { resourceAdminQuery, resourceCategoryListResponse, resourceCreateBody, resourceErrorResponse, resourceFileResponse, resourceListResponse, resourcePublicQuery, resourceResponse, resourceUpdateBody } from '../dtos/schemas'
import { fileService } from '../services/file.service'
import { resourceService } from '../services/resource.service'

const idParams = t.Object({ id: t.Integer({ minimum: 1 }) })

export const resourceRoutes = new Elysia({ prefix: '/api/v1' })
  .get('/resources/categories', () => resourceService.activeCategories(), {
    response: { 200: resourceCategoryListResponse },
    detail: { tags: ['Recursos'], summary: 'Consulta categorías activas de recursos', description: 'Devuelve las categorías activas disponibles para filtrar el catálogo público o asignar recursos administrativos.' }
  })
  .get('/resources', ({ query }) => resourceService.publicList(query), {
    query: resourcePublicQuery, response: { 200: resourceListResponse },
    detail: { tags: ['Recursos'], summary: 'Busca recursos publicados', description: 'Busca por texto o categoría y pagina únicamente recursos PUBLICADO cuya fecha ya llegó.' }
  })
  .get('/resources/:id', ({ params }) => resourceService.publicById(params.id), {
    params: idParams, response: { 200: resourceResponse, 404: resourceErrorResponse },
    detail: { tags: ['Recursos'], summary: 'Consulta un recurso publicado', description: 'No expone borradores, archivados, publicaciones programadas ni recursos de categorías inactivas.' }
  })
  .get('/resources/:id/download', async ({ params, set }) => {
    const file = await fileService.downloadForPublicResource(params.id)
    set.headers['content-type'] = file.mimeType
    set.headers['content-disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`
    return file.bytes
  }, {
    params: idParams,
    detail: { tags: ['Recursos'], summary: 'Descarga el archivo de un recurso publicado', description: 'Solo permite descargar archivos asociados a recursos publicados y vigentes.' }
  })
  .get('/admin/resources', async ({ request, query }) => { await requireAdmin(request, 'RESOURCES_MANAGE'); return resourceService.adminList(query) }, {
    query: resourceAdminQuery, response: { 200: resourceListResponse, 401: resourceErrorResponse, 503: resourceErrorResponse },
    detail: { tags: ['Administración'], summary: 'Lista recursos administrativos', description: 'Incluye todos los estados y permite filtrar por texto, categoría o estado. Requiere una sesión con RESOURCES_MANAGE.' }
  })
  .get('/admin/resources/:id', async ({ request, params }) => { await requireAdmin(request, 'RESOURCES_MANAGE'); return resourceService.adminById(params.id) }, {
    params: idParams, response: { 200: resourceResponse, 401: resourceErrorResponse, 404: resourceErrorResponse, 503: resourceErrorResponse },
    detail: { tags: ['Administración'], summary: 'Consulta un recurso administrativo', description: 'Incluye recursos no visibles públicamente. Requiere una sesión con RESOURCES_MANAGE.' }
  })
  .post('/admin/resources', async ({ request, body, set }) => { const authenticated = await requireAdmin(request, 'RESOURCES_MANAGE'); set.status = 201; return resourceService.create({ ...body, createdById: authenticated.user.id }) }, {
    body: resourceCreateBody, response: { 201: resourceResponse, 401: resourceErrorResponse, 422: resourceErrorResponse, 503: resourceErrorResponse },
    detail: { tags: ['Administración'], summary: 'Crea un recurso', description: 'Un recurso PUBLICADO requiere un archivo o al menos un enlace.' }
  })
  .put('/admin/resources/:id', async ({ request, params, body }) => { await requireAdmin(request, 'RESOURCES_MANAGE'); return resourceService.update(params.id, body) }, {
    params: idParams, body: resourceUpdateBody, response: { 200: resourceResponse, 401: resourceErrorResponse, 404: resourceErrorResponse, 422: resourceErrorResponse, 503: resourceErrorResponse },
    detail: { tags: ['Administración'], summary: 'Actualiza un recurso', description: 'Si se envía links, reemplaza todos los enlaces del recurso. Un recurso PUBLICADO debe conservar un archivo o al menos un enlace.' }
  })
  .patch('/admin/resources/:id/archive', async ({ request, params }) => { await requireAdmin(request, 'RESOURCES_MANAGE'); return resourceService.archive(params.id) }, {
    params: idParams, response: { 200: resourceResponse, 401: resourceErrorResponse, 404: resourceErrorResponse, 503: resourceErrorResponse },
    detail: { tags: ['Administración'], summary: 'Archiva un recurso', description: 'Retira el recurso de las consultas públicas y limpia su fecha de publicación.' }
  })
  .delete('/admin/resources/:id', async ({ request, params }) => { await requireAdmin(request, 'RESOURCES_MANAGE'); return resourceService.remove(params.id) }, {
    params: idParams, response: { 200: resourceResponse, 401: resourceErrorResponse, 404: resourceErrorResponse, 503: resourceErrorResponse },
    detail: { tags: ['Administración'], summary: 'Elimina un recurso', description: 'Elimina permanentemente el recurso y sus enlaces asociados.' }
  })
  .post('/admin/files', async ({ request, set }) => {
    const authenticated = await requireAdmin(request, 'RESOURCES_MANAGE')
    const input = (await request.formData()).get('file')
    if (!input || typeof input !== 'object' || typeof (input as File).arrayBuffer !== 'function' || typeof (input as File).name !== 'string') throw new AppError(422, 'FILE_REQUIRED', 'Debes enviar el campo multipart `file`.')
    set.status = 201
    return fileService.upload(authenticated.user.id, input as File)
  }, {
    parse: 'none',
    response: { 201: resourceFileResponse, 401: resourceErrorResponse, 403: resourceErrorResponse, 422: resourceErrorResponse, 503: resourceErrorResponse },
    detail: { tags: ['Administración'], summary: 'Carga un archivo académico', description: 'Recibe un archivo multipart y crea sus metadatos. Requiere RESOURCES_MANAGE.' }
  })
  .delete('/admin/files/:id', async ({ request, params }) => { await requireAdmin(request, 'RESOURCES_MANAGE'); return fileService.remove(params.id) }, {
    params: idParams, response: { 200: resourceFileResponse, 401: resourceErrorResponse, 403: resourceErrorResponse, 404: resourceErrorResponse, 409: resourceErrorResponse, 503: resourceErrorResponse },
    detail: { tags: ['Administración'], summary: 'Elimina un archivo académico', description: 'Elimina los metadatos y el binario si no está asociado a contenido.' }
  })
