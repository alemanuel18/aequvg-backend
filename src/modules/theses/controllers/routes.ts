import { Elysia, t } from 'elysia'
import { requireAdmin } from '../../../middleware/admin'
import { prisma } from '../../../shared/database/prisma'
import { AppError } from '../../../shared/errors/app-error'

const idParams = t.Object({ id: t.Integer({ minimum: 1 }) })
const thesisBody = t.Object({
  sourceIdentifier: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
  title: t.String({ minLength: 3, maxLength: 300 }),
  author: t.Optional(t.Nullable(t.String({ maxLength: 300 }))),
  publicationYear: t.Optional(t.Nullable(t.Integer({ minimum: 1900, maximum: 9999 }))),
  summary: t.Optional(t.Nullable(t.String({ maxLength: 12000 }))),
  url: t.String({ format: 'uri', maxLength: 2048 }),
  publishedAt: t.Optional(t.Nullable(t.String({ format: 'date-time' })))
})
const listQuery = t.Object({ page: t.Optional(t.Integer({ minimum: 1 })), pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 100 })) })
const errorResponse = t.Object({ error: t.Object({ code: t.String(), message: t.String() }) })

export const thesisRoutes = new Elysia({ prefix: '/api/v1' })
  .get('/admin/theses', async ({ request, query }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    const page = query.page ?? 1, pageSize = query.pageSize ?? 20
    const [items, total] = await Promise.all([
      prisma.thesisLink.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize, include: { createdBy: { select: { id: true, name: true } } } }),
      prisma.thesisLink.count()
    ])
    return { items, pagination: { page, pageSize, total } }
  }, { query: listQuery, response: { 200: t.Any(), 401: errorResponse, 403: errorResponse }, detail: { tags: ['Administración'], summary: 'Lista enlaces de tesis', description: 'Requiere sesión administrativa con PAPERS_MANAGE. No consulta ni almacena documentos.' } })
  .post('/admin/theses', async ({ request, body, set }) => {
    const admin = await requireAdmin(request, 'PAPERS_MANAGE')
    set.status = 201
    try {
      return await prisma.thesisLink.create({ data: { ...body, publishedAt: body.publishedAt ? new Date(body.publishedAt) : null, createdById: admin.user.id } })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new AppError(409, 'THESIS_LINK_EXISTS', 'Ya existe una tesis con ese enlace o identificador.')
      throw error
    }
  }, { body: thesisBody, response: { 201: t.Any(), 401: errorResponse, 403: errorResponse, 409: errorResponse, 422: errorResponse }, detail: { tags: ['Administración'], summary: 'Agrega un enlace de tesis', description: 'El autor del registro se deriva de la sesión. Solo se guarda el enlace y sus metadatos; no admite archivos.' } })
  .put('/admin/theses/:id', async ({ request, params, body }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    try {
      return await prisma.thesisLink.update({ where: { id: params.id }, data: { ...body, ...(body.publishedAt !== undefined ? { publishedAt: body.publishedAt ? new Date(body.publishedAt) : null } : {}) } })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') throw new AppError(404, 'THESIS_NOT_FOUND', 'La tesis no existe.')
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new AppError(409, 'THESIS_LINK_EXISTS', 'Ya existe una tesis con ese enlace o identificador.')
      throw error
    }
  }, { params: idParams, body: t.Partial(thesisBody), response: { 200: t.Any(), 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }, detail: { tags: ['Administración'], summary: 'Edita metadatos o enlace de tesis', description: 'Requiere PAPERS_MANAGE. No permite cargar ni asociar archivos.' } })
  .delete('/admin/theses/:id', async ({ request, params }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    try { await prisma.thesisLink.delete({ where: { id: params.id } }); return { message: 'Enlace de tesis eliminado.' } }
    catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') throw new AppError(404, 'THESIS_NOT_FOUND', 'La tesis no existe.'); throw error }
  }, { params: idParams, response: { 200: t.Object({ message: t.String() }), 401: errorResponse, 403: errorResponse, 404: errorResponse }, detail: { tags: ['Administración'], summary: 'Elimina un enlace de tesis', description: 'Requiere PAPERS_MANAGE.' } })
