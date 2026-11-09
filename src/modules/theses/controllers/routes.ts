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
const listQuery = t.Object({ page: t.Optional(t.Integer({ minimum: 1 })), pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 100 })), q: t.Optional(t.String({ minLength: 1, maxLength: 160 })) })
const errorResponse = t.Object({ error: t.Object({ code: t.String(), message: t.String() }) })
const thesisCommonResponse = {
  id: t.Integer(),
  sourceIdentifier: t.Nullable(t.String()),
  title: t.String(),
  author: t.Nullable(t.String()),
  publicationYear: t.Nullable(t.Integer()),
  summary: t.Nullable(t.String()),
  url: t.String({ format: 'uri' })
}
const thesisPublicResponse = t.Object({ ...thesisCommonResponse, publishedAt: t.Nullable(t.String({ format: 'date-time' })) })
const thesisRecordResponse = t.Object({ ...thesisCommonResponse,
  publishedAt: t.Nullable(t.String({ format: 'date-time' })),
  createdById: t.Integer(),
  createdAt: t.String({ format: 'date-time' }),
  updatedAt: t.String({ format: 'date-time' })
})
const thesisAdminResponse = t.Object({ ...thesisCommonResponse,
  publishedAt: t.Nullable(t.String({ format: 'date-time' })),
  createdById: t.Integer(),
  createdAt: t.String({ format: 'date-time' }),
  updatedAt: t.String({ format: 'date-time' }),
  createdBy: t.Object({ id: t.Integer(), name: t.String() })
})
const publicListResponse = t.Object({
  items: t.Array(thesisPublicResponse),
  pagination: t.Object({ page: t.Integer(), pageSize: t.Integer(), total: t.Integer(), totalPages: t.Integer() })
})
const adminListResponse = t.Object({
  items: t.Array(thesisAdminResponse),
  pagination: t.Object({ page: t.Integer(), pageSize: t.Integer(), total: t.Integer() })
})
const adminCreateResponse = thesisRecordResponse

const serializePublicThesis = <T extends { publishedAt: Date | null }>(thesis: T) => ({
  ...thesis,
  publishedAt: thesis.publishedAt?.toISOString() ?? null
})
const serializeThesisRecord = <T extends { createdAt: Date; updatedAt: Date; publishedAt: Date | null }>(thesis: T) => ({
  ...thesis,
  createdAt: thesis.createdAt.toISOString(),
  updatedAt: thesis.updatedAt.toISOString(),
  publishedAt: thesis.publishedAt?.toISOString() ?? null
})

const assertHttpUrl = (value: string) => {
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new AppError(422, 'INVALID_THESIS_URL', 'Ingresa una URL válida que comience con http:// o https://.') }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
    throw new AppError(422, 'INVALID_THESIS_URL', 'Ingresa una URL válida que comience con http:// o https://.')
  }
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
      prisma.thesisLink.findMany({ where, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize, select: { id: true, sourceIdentifier: true, title: true, author: true, publicationYear: true, summary: true, url: true, publishedAt: true } }),
      prisma.thesisLink.count({ where })
    ])
    return { items: items.map(serializePublicThesis), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }
  }, { query: listQuery, response: { 200: publicListResponse, 422: errorResponse }, detail: { tags: ['Tesis'], summary: 'Lista tesis publicadas', description: 'Consulta pública paginada; page inicia en 1, pageSize es 1–100 (predeterminado 20) y q busca en título, autor o resumen. Solo devuelve enlaces publicados; no descarga archivos ni consulta el repositorio externo.' } })
  .get('/theses/:id', async ({ params }) => {
    const thesis = await prisma.thesisLink.findFirst({ where: { id: params.id, publishedAt: { not: null, lte: new Date() } }, select: { id: true, sourceIdentifier: true, title: true, author: true, publicationYear: true, summary: true, url: true, publishedAt: true } })
    if (!thesis) throw new AppError(404, 'THESIS_NOT_FOUND', 'La tesis no existe o no está publicada.')
    return serializePublicThesis(thesis)
  }, { params: idParams, response: { 200: thesisPublicResponse, 404: errorResponse }, detail: { tags: ['Tesis'], summary: 'Consulta una tesis publicada', description: 'Devuelve los metadatos públicos y el enlace de origen de una tesis publicada. Si no existe o no está publicada, devuelve 404 THESIS_NOT_FOUND.' } })
  .get('/admin/theses', async ({ request, query }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    const page = query.page ?? 1, pageSize = query.pageSize ?? 20
    const [items, total] = await Promise.all([
      prisma.thesisLink.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize, include: { createdBy: { select: { id: true, name: true } } } }),
      prisma.thesisLink.count()
    ])
    return { items: items.map(item => ({ ...serializeThesisRecord(item), createdBy: item.createdBy })), pagination: { page, pageSize, total } }
  }, { query: listQuery, response: { 200: adminListResponse, 401: errorResponse, 403: errorResponse, 422: errorResponse }, detail: { tags: ['Tesis', 'Administración'], summary: 'Lista enlaces de tesis', description: 'Requiere sesión administrativa con PAPERS_MANAGE. Incluye borradores y registros publicados. No consulta ni almacena documentos.', security: [{ cookieAuth: [] }] } })
  .post('/admin/theses', async ({ request, body, set }) => {
    const admin = await requireAdmin(request, 'PAPERS_MANAGE')
    assertHttpUrl(body.url)
    set.status = 201
    try {
      const thesis = await prisma.thesisLink.create({ data: { ...body, publishedAt: body.publishedAt ? new Date(body.publishedAt) : null, createdById: admin.user.id } })
      return serializeThesisRecord(thesis)
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new AppError(409, 'THESIS_LINK_EXISTS', 'Ya existe una tesis con ese enlace o identificador.')
      throw error
    }
  }, { body: thesisBody, response: { 201: adminCreateResponse, 401: errorResponse, 403: errorResponse, 409: errorResponse, 422: errorResponse }, detail: { tags: ['Tesis', 'Administración'], summary: 'Agrega un enlace de tesis', description: 'Requiere PAPERS_MANAGE y X-CSRF-Token. title (mínimo 3 caracteres) y url son obligatorios en la API; author y otros metadatos son opcionales en el contrato. La URL debe usar HTTP o HTTPS. El autor administrativo se deriva de la sesión. 409 THESIS_LINK_EXISTS indica URL o identificador duplicado; 422 INVALID_THESIS_URL indica URL inválida. Solo se guarda el enlace y metadatos; no admite archivos.', security: [{ cookieAuth: [], csrfToken: [] }] } })
  .put('/admin/theses/:id', async ({ request, params, body }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    if (body.url !== undefined) assertHttpUrl(body.url)
    try {
      const thesis = await prisma.thesisLink.update({ where: { id: params.id }, data: { ...body, ...(body.publishedAt !== undefined ? { publishedAt: body.publishedAt ? new Date(body.publishedAt) : null } : {}) } })
      return serializeThesisRecord(thesis)
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') throw new AppError(404, 'THESIS_NOT_FOUND', 'La tesis no existe.')
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new AppError(409, 'THESIS_LINK_EXISTS', 'Ya existe una tesis con ese enlace o identificador.')
      throw error
    }
  }, { params: idParams, body: t.Partial(thesisBody), response: { 200: adminCreateResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }, detail: { tags: ['Tesis', 'Administración'], summary: 'Edita metadatos o enlace de tesis', description: 'Requiere PAPERS_MANAGE y X-CSRF-Token. La URL, si se envía, debe usar HTTP o HTTPS. 404 THESIS_NOT_FOUND indica que el registro no existe; 409 THESIS_LINK_EXISTS indica URL o identificador duplicado; 422 INVALID_THESIS_URL indica URL inválida. No permite cargar ni asociar archivos.', security: [{ cookieAuth: [], csrfToken: [] }] } })
  .delete('/admin/theses/:id', async ({ request, params }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    try { await prisma.thesisLink.delete({ where: { id: params.id } }); return { message: 'Enlace de tesis eliminado.' } }
    catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') throw new AppError(404, 'THESIS_NOT_FOUND', 'La tesis no existe.'); throw error }
  }, { params: idParams, response: { 200: t.Object({ message: t.String() }), 401: errorResponse, 403: errorResponse, 404: errorResponse }, detail: { tags: ['Tesis', 'Administración'], summary: 'Elimina un enlace de tesis', description: 'Requiere PAPERS_MANAGE y X-CSRF-Token. Elimina la publicación local; no elimina ni modifica el registro o archivo del repositorio universitario. 404 THESIS_NOT_FOUND indica que el registro no existe.', security: [{ cookieAuth: [], csrfToken: [] }] } })
