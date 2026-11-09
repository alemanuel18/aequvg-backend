import { Elysia, t } from 'elysia'
import { requireAdmin } from '../../../middleware/admin'
import { AppError } from '../../../shared/errors/app-error'
import { fileService } from '../../resources/services/file.service'
import { blogCreateBody, blogErrorResponse, blogListResponse, blogQuery, blogResponse, blogUpdateBody } from '../dtos/schemas'
import { blogService } from '../services/blog.service'

const idParams = t.Object({ id: t.Integer({ minimum: 1 }) })
const slugParams = t.Object({ slug: t.String({ minLength: 1, maxLength: 240 }) })
export const blogRoutes = new Elysia({ prefix: '/api/v1' })
  .get('/blog', ({ query }) => blogService.publicList(query), { query: blogQuery, response: { 200: blogListResponse }, detail: { tags: ['Blog ACS'], summary: 'Lista entradas publicadas del blog', description: 'Solo devuelve entradas publicadas cuya fecha de publicación ya llegó.' } })
  .get('/blog/:slug', ({ params }) => blogService.publicBySlug(params.slug), { params: slugParams, response: { 200: blogResponse, 404: blogErrorResponse }, detail: { tags: ['Blog ACS'], summary: 'Consulta una entrada publicada por slug' } })
  .get('/admin/blog', async ({ request, query }) => { await requireAdmin(request, 'BLOG_MANAGE'); return blogService.adminList(query) }, { query: blogQuery, response: { 200: blogListResponse, 401: blogErrorResponse, 403: blogErrorResponse, 422: blogErrorResponse, 503: blogErrorResponse }, detail: { tags: ['Administración'], summary: 'Lista entradas del blog en cualquier estado', description: 'Requiere el permiso BLOG_MANAGE.' } })
  .get('/admin/blog/images', async ({ request }) => { await requireAdmin(request, 'BLOG_MANAGE'); return fileService.listImages() }, { response: { 200: t.Array(t.Object({ id: t.Integer(), originalName: t.String(), mimeType: t.String(), sizeBytes: t.Integer(), createdAt: t.Date(), previewUrl: t.String() })), 401: blogErrorResponse, 403: blogErrorResponse, 503: blogErrorResponse }, detail: { tags: ['Administración'], summary: 'Lista imágenes disponibles para el blog' } })
  .post('/admin/blog/images', async ({ request, set }) => {
    const authenticated = await requireAdmin(request, 'BLOG_MANAGE')
    const input = (await request.formData()).get('file')
    if (!input || typeof input !== 'object' || typeof (input as File).arrayBuffer !== 'function' || typeof (input as File).name !== 'string') throw new AppError(422, 'FILE_REQUIRED', 'Debes enviar el campo multipart `file`.')
    set.status = 201; return fileService.uploadImage(authenticated.user.id, input as File)
  }, { parse: 'none', response: { 201: t.Any(), 401: blogErrorResponse, 403: blogErrorResponse, 422: blogErrorResponse, 503: blogErrorResponse }, detail: { tags: ['Administración'], summary: 'Carga una imagen para el blog' } })
  .get('/admin/blog/:id', async ({ request, params }) => { await requireAdmin(request, 'BLOG_MANAGE'); return blogService.adminById(params.id) }, { params: idParams, response: { 200: blogResponse, 401: blogErrorResponse, 403: blogErrorResponse, 404: blogErrorResponse, 503: blogErrorResponse }, detail: { tags: ['Administración'], summary: 'Consulta una entrada para edición' } })
  .post('/admin/blog', async ({ request, body, set }) => { const auth = await requireAdmin(request, 'BLOG_MANAGE'); set.status = 201; return blogService.create({ ...body, createdById: auth.user.id }) }, { body: blogCreateBody, response: { 201: blogResponse, 401: blogErrorResponse, 403: blogErrorResponse, 409: blogErrorResponse, 422: blogErrorResponse, 503: blogErrorResponse }, detail: { tags: ['Administración'], summary: 'Crea una entrada del blog' } })
  .put('/admin/blog/:id', async ({ request, params, body }) => { await requireAdmin(request, 'BLOG_MANAGE'); return blogService.update(params.id, body) }, { params: idParams, body: blogUpdateBody, response: { 200: blogResponse, 401: blogErrorResponse, 403: blogErrorResponse, 404: blogErrorResponse, 409: blogErrorResponse, 422: blogErrorResponse, 503: blogErrorResponse }, detail: { tags: ['Administración'], summary: 'Actualiza una entrada del blog' } })
  .patch('/admin/blog/:id/archive', async ({ request, params }) => { await requireAdmin(request, 'BLOG_MANAGE'); return blogService.archive(params.id) }, { params: idParams, response: { 200: blogResponse, 401: blogErrorResponse, 403: blogErrorResponse, 404: blogErrorResponse, 503: blogErrorResponse }, detail: { tags: ['Administración'], summary: 'Archiva una entrada del blog' } })
  .delete('/admin/blog/:id', async ({ request, params }) => { await requireAdmin(request, 'BLOG_MANAGE'); return blogService.remove(params.id) }, { params: idParams, response: { 200: blogResponse, 401: blogErrorResponse, 403: blogErrorResponse, 404: blogErrorResponse, 503: blogErrorResponse }, detail: { tags: ['Administración'], summary: 'Elimina una entrada del blog' } })
