import { Elysia, t } from 'elysia'
import type { Prisma } from '@prisma/client'
import { requireAdmin } from '../../../middleware/admin'
import { prisma } from '../../../shared/database/prisma'
import { AppError } from '../../../shared/errors/app-error'
import { normalizeThesisRepositoryUrl, validateThesisRequiredFields } from '../services/thesis.service'

const idParams = t.Object({ id: t.Integer({ minimum: 1 }) })
const thesisBody = t.Object({
  title: t.String({ minLength: 3, maxLength: 300 }),
  author: t.String({ minLength: 1, maxLength: 300, description: 'Autor principal en texto simple; la gestión de coautores queda fuera de este sprint.' }),
  publicationYear: t.Integer({ minimum: 1900, maximum: 9999 }),
  summary: t.String({ minLength: 1, maxLength: 12000 }),
  url: t.String({ minLength: 1, maxLength: 2048, description: 'URL HTTPS única del repositorio. Se normalizan espacios externos, esquema y host; se conserva la ruta.' }),
  publishedAt: t.Optional(t.Nullable(t.String({ format: 'date-time' })))
}, { additionalProperties: false })
const listQuery = t.Object({ page: t.Optional(t.Integer({ minimum: 1 })), pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 100 })), q: t.Optional(t.String({ minLength: 1, maxLength: 160 })) })
const errorResponse = t.Object({ error: t.Object({ code: t.String(), message: t.String() }) })

const ensureUniqueThesisUrl = async (tx: Prisma.TransactionClient, value: string, excludeId?: number) => {
  // Serialize URL checks and writes so canonical variants cannot race past the read check.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(74123, 1)::text AS locked`
  const normalized = normalizeThesisRepositoryUrl(value)
  const existing = await tx.thesisLink.findMany({ select: { id: true, url: true } })
  const duplicate = existing.some((item) => {
    if (item.id === excludeId) return false
    try { return normalizeThesisRepositoryUrl(item.url) === normalized } catch { return false }
  })
  if (duplicate) throw new AppError(409, 'THESIS_LINK_EXISTS', 'Ya existe una tesis con esa URL del repositorio.')
  return normalized
}

export const thesisRoutes = new Elysia({ prefix: '/api/v1' })
  .get('/theses', async ({ query }) => {
    const page = query.page ?? 1, pageSize = query.pageSize ?? 20
    const search = query.q?.trim()
    const where = {
      publishedAt: { not: null, lte: new Date() },
      ...(search ? { OR: [
        { title: { contains: search, mode: 'insensitive' as const } },
        { author: { contains: search, mode: 'insensitive' as const } },
        { summary: { contains: search, mode: 'insensitive' as const } }
      ] } : {})
    }
    const [items, total] = await Promise.all([
      prisma.thesisLink.findMany({ where, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize, select: { id: true, title: true, author: true, publicationYear: true, summary: true, url: true, publishedAt: true } }),
      prisma.thesisLink.count({ where })
    ])
    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }
  }, { query: listQuery, response: { 200: t.Any() }, detail: { tags: ['Tesis'], summary: 'Lista tesis publicadas', description: 'Consulta pública paginada. Solo devuelve enlaces publicados; no descarga archivos ni consulta el repositorio externo.' } })
  .get('/theses/:id', async ({ params }) => {
    const thesis = await prisma.thesisLink.findFirst({ where: { id: params.id, publishedAt: { not: null, lte: new Date() } }, select: { id: true, title: true, author: true, publicationYear: true, summary: true, url: true, publishedAt: true } })
    if (!thesis) throw new AppError(404, 'THESIS_NOT_FOUND', 'La tesis no existe o no está publicada.')
    return thesis
  }, { params: idParams, response: { 200: t.Any(), 404: errorResponse }, detail: { tags: ['Tesis'], summary: 'Consulta una tesis publicada', description: 'Devuelve los metadatos públicos y el enlace de origen de una tesis publicada.' } })
  .get('/admin/theses', async ({ request, query }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    const page = query.page ?? 1, pageSize = query.pageSize ?? 20
    const [items, total] = await Promise.all([
      prisma.thesisLink.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize, select: { id: true, title: true, author: true, publicationYear: true, summary: true, url: true, createdById: true, createdAt: true, updatedAt: true, publishedAt: true, createdBy: { select: { id: true, name: true } } } }),
      prisma.thesisLink.count()
    ])
    return { items, pagination: { page, pageSize, total } }
  }, { query: listQuery, response: { 200: t.Any(), 401: errorResponse, 403: errorResponse }, detail: { tags: ['Administración'], summary: 'Lista enlaces de tesis', description: 'Requiere sesión administrativa con PAPERS_MANAGE. No consulta ni almacena documentos.' } })
  .post('/admin/theses', async ({ request, body, set }) => {
    const admin = await requireAdmin(request, 'PAPERS_MANAGE')
    validateThesisRequiredFields(body)
    set.status = 201
    try {
      return await prisma.$transaction(async (tx) => {
        const url = await ensureUniqueThesisUrl(tx, body.url)
        return tx.thesisLink.create({ data: { title: body.title.trim(), author: body.author.trim(), publicationYear: body.publicationYear, summary: body.summary.trim(), url, publishedAt: body.publishedAt ? new Date(body.publishedAt) : null, createdById: admin.user.id }, select: { id: true, title: true, author: true, publicationYear: true, summary: true, url: true, createdById: true, createdAt: true, updatedAt: true, publishedAt: true } })
      })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new AppError(409, 'THESIS_LINK_EXISTS', 'Ya existe una tesis con esa URL del repositorio.')
      throw error
    }
  }, { body: thesisBody, response: { 201: t.Any(), 401: errorResponse, 403: errorResponse, 409: errorResponse, 422: errorResponse }, detail: { tags: ['Administración'], summary: 'Agrega un enlace de tesis', description: 'Título, autor, año, resumen y URL HTTPS del repositorio son obligatorios. La URL se normaliza y es única entre tesis. El creador del registro se deriva de la sesión. El identificador de repositorio no se acepta; no se admiten archivos ni coautores estructurados en este sprint.' } })
  .put('/admin/theses/:id', async ({ request, params, body }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    try {
      return await prisma.$transaction(async (tx) => {
        const current = await tx.thesisLink.findUnique({ where: { id: params.id }, select: { id: true, title: true, author: true, publicationYear: true, summary: true, url: true } })
        if (!current) throw new AppError(404, 'THESIS_NOT_FOUND', 'La tesis no existe.')
        const requiredFields = {
          title: body.title ?? current.title,
          author: body.author ?? current.author,
          publicationYear: body.publicationYear ?? current.publicationYear,
          summary: body.summary ?? current.summary
        }
        validateThesisRequiredFields(requiredFields)
        const url = await ensureUniqueThesisUrl(tx, body.url ?? current.url, params.id)
        return tx.thesisLink.update({ where: { id: params.id }, data: { title: requiredFields.title!.trim(), author: requiredFields.author!.trim(), publicationYear: requiredFields.publicationYear!, summary: requiredFields.summary!.trim(), url, ...(body.publishedAt !== undefined ? { publishedAt: body.publishedAt ? new Date(body.publishedAt) : null } : {}) }, select: { id: true, title: true, author: true, publicationYear: true, summary: true, url: true, createdById: true, createdAt: true, updatedAt: true, publishedAt: true } })
      })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') throw new AppError(404, 'THESIS_NOT_FOUND', 'La tesis no existe.')
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new AppError(409, 'THESIS_LINK_EXISTS', 'Ya existe una tesis con esa URL del repositorio.')
      throw error
    }
  }, { params: idParams, body: t.Partial(thesisBody), response: { 200: t.Any(), 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }, detail: { tags: ['Administración'], summary: 'Edita metadatos o enlace de tesis', description: 'Los registros deben conservar título, autor, año, resumen y URL HTTPS. La URL se normaliza y es única entre tesis. No permite cargar identificadores de repositorio ni archivos.' } })
  .delete('/admin/theses/:id', async ({ request, params }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    try { await prisma.thesisLink.delete({ where: { id: params.id } }); return { message: 'Enlace de tesis eliminado.' } }
    catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') throw new AppError(404, 'THESIS_NOT_FOUND', 'La tesis no existe.'); throw error }
  }, { params: idParams, response: { 200: t.Object({ message: t.String() }), 401: errorResponse, 403: errorResponse, 404: errorResponse }, detail: { tags: ['Administración'], summary: 'Elimina un enlace de tesis', description: 'Requiere PAPERS_MANAGE.' } })
