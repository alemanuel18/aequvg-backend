import { Elysia, t } from 'elysia'
import type { Prisma } from '@prisma/client'
import { requireAdmin } from '../../../middleware/admin'
import { prisma } from '../../../shared/database/prisma'
import { AppError } from '../../../shared/errors/app-error'
import { resolveThesisContributors, type ThesisContributorInput } from '../services/thesis-authors.service'
import { normalizeThesisRepositoryUrl, validateThesisRequiredFields } from '../services/thesis.service'

const idParams = t.Object({ id: t.Integer({ minimum: 1 }) })
const thesisContributorBody = t.Object({
  personId: t.Optional(t.Integer({ minimum: 1 })),
  name: t.Optional(t.String({ minLength: 1, maxLength: 300 }))
}, { additionalProperties: false })
const thesisBody = t.Object({
  title: t.String({ minLength: 3, maxLength: 300 }),
  author: t.Optional(t.String({ minLength: 1, maxLength: 300, description: 'Alias de compatibilidad para clientes anteriores; se convierte en un autor principal.' })),
  contributors: t.Optional(t.Array(thesisContributorBody, { minItems: 1, maxItems: 50, description: 'Lista completa ordenada. El primer elemento es el autor principal.' })),
  publicationYear: t.Integer({ minimum: 1900, maximum: 9999 }),
  summary: t.String({ minLength: 1, maxLength: 12000 }),
  url: t.String({ minLength: 1, maxLength: 2048, description: 'URL HTTPS única del repositorio. Se normalizan espacios externos, esquema y host; se conserva la ruta.' }),
  publishedAt: t.Optional(t.Nullable(t.String({ format: 'date-time' })))
}, { additionalProperties: false })
const listQuery = t.Object({ page: t.Optional(t.Integer({ minimum: 1 })), pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 100 })), q: t.Optional(t.String({ minLength: 1, maxLength: 160 })) })
const authorQuery = t.Object({ q: t.Optional(t.String({ minLength: 1, maxLength: 160 })), page: t.Optional(t.Integer({ minimum: 1 })), pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 100 })) })
const errorResponse = t.Object({ error: t.Object({ code: t.String(), message: t.String() }) })

const thesisSelect = {
  id: true, title: true, author: true, publicationYear: true, summary: true, url: true,
  createdById: true, createdAt: true, updatedAt: true, publishedAt: true,
  contributors: {
    orderBy: { authorOrder: 'asc' as const },
    select: { personId: true, role: true, authorOrder: true, person: { select: { id: true, name: true } } }
  }
}

const publicThesisSelect = {
  id: true, title: true, author: true, publicationYear: true, summary: true, url: true, publishedAt: true,
  contributors: {
    orderBy: { authorOrder: 'asc' as const },
    select: { personId: true, role: true, authorOrder: true, person: { select: { id: true, name: true } } }
  }
}

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

const resolveRequestedContributors = async (
  tx: Prisma.TransactionClient,
  body: { author?: string; contributors?: ThesisContributorInput[] },
  currentCoauthors: Array<{ personId: number }> = []
) => {
  if (body.author !== undefined && body.contributors !== undefined) {
    throw new AppError(422, 'THESIS_AUTHOR_FIELDS_CONFLICT', 'Envía la lista contributors o el campo author de compatibilidad, no ambos.')
  }
  if (body.contributors !== undefined) return resolveThesisContributors(tx, body.contributors)
  if (body.author !== undefined) {
    return resolveThesisContributors(tx, [{ name: body.author }, ...currentCoauthors.map(({ personId }) => ({ personId }))])
  }
  return null
}

const createContributorLinks = (tx: Prisma.TransactionClient, thesisId: number, contributors: Awaited<ReturnType<typeof resolveThesisContributors>>) =>
  tx.thesisContributor.createMany({
    data: contributors.map(({ personId, role, authorOrder }) => ({ thesisId, personId, role, authorOrder }))
  })

export const thesisRoutes = new Elysia({ prefix: '/api/v1' })
  .get('/theses', async ({ query }) => {
    const page = query.page ?? 1, pageSize = query.pageSize ?? 20
    const search = query.q?.trim()
    const where = {
      publishedAt: { not: null, lte: new Date() },
      ...(search ? { OR: [
        { title: { contains: search, mode: 'insensitive' as const } },
        { author: { contains: search, mode: 'insensitive' as const } },
        { contributors: { some: { person: { name: { contains: search, mode: 'insensitive' as const } } } } },
        { summary: { contains: search, mode: 'insensitive' as const } }
      ] } : {})
    }
    const [items, total] = await Promise.all([
      prisma.thesisLink.findMany({ where, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize, select: publicThesisSelect }),
      prisma.thesisLink.count({ where })
    ])
    return { items, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }
  }, { query: listQuery, response: { 200: t.Any() }, detail: { tags: ['Tesis'], summary: 'Lista tesis publicadas', description: 'Consulta pública paginada. Incluye autores ordenados y el alias temporal author. Solo devuelve enlaces publicados; no descarga archivos ni consulta el repositorio externo.' } })
  .get('/theses/:id', async ({ params }) => {
    const thesis = await prisma.thesisLink.findFirst({ where: { id: params.id, publishedAt: { not: null, lte: new Date() } }, select: publicThesisSelect })
    if (!thesis) throw new AppError(404, 'THESIS_NOT_FOUND', 'La tesis no existe o no está publicada.')
    return thesis
  }, { params: idParams, response: { 200: t.Any(), 404: errorResponse }, detail: { tags: ['Tesis'], summary: 'Consulta una tesis publicada', description: 'Devuelve metadatos, autores en orden y el enlace de origen de una tesis publicada.' } })
  .get('/admin/thesis-authors', async ({ request, query }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    const page = query.page ?? 1, pageSize = query.pageSize ?? 100
    const search = query.q?.trim()
    const where = search ? { name: { contains: search, mode: 'insensitive' as const } } : {}
    const [items, total] = await Promise.all([
      prisma.authorPerson.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize, select: { id: true, name: true } }),
      prisma.authorPerson.count({ where })
    ])
    return { items, pagination: { page, pageSize, total } }
  }, { query: authorQuery, response: { 200: t.Any(), 401: errorResponse, 403: errorResponse }, detail: { tags: ['Administración'], summary: 'Busca autores existentes', description: 'Requiere PAPERS_MANAGE. La junta puede reutilizar un registro por selección explícita; nombres iguales no se fusionan automáticamente.' } })
  .get('/admin/theses', async ({ request, query }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    const page = query.page ?? 1, pageSize = query.pageSize ?? 20
    const [items, total] = await Promise.all([
      prisma.thesisLink.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize, select: { ...thesisSelect, createdBy: { select: { id: true, name: true } } } }),
      prisma.thesisLink.count()
    ])
    return { items, pagination: { page, pageSize, total } }
  }, { query: listQuery, response: { 200: t.Any(), 401: errorResponse, 403: errorResponse }, detail: { tags: ['Administración'], summary: 'Lista enlaces de tesis', description: 'Incluye autores ordenados y el alias temporal author. Requiere PAPERS_MANAGE; no consulta ni almacena documentos.' } })
  .post('/admin/theses', async ({ request, body, set }) => {
    const admin = await requireAdmin(request, 'PAPERS_MANAGE')
    validateThesisRequiredFields(body)
    if (body.author === undefined && body.contributors === undefined) {
      throw new AppError(422, 'THESIS_CONTRIBUTORS_REQUIRED', 'Agrega un autor principal y ordena los coautores.')
    }
    set.status = 201
    try {
      return await prisma.$transaction(async (tx) => {
        const url = await ensureUniqueThesisUrl(tx, body.url)
        const contributors = await resolveRequestedContributors(tx, body)
        const principal = contributors?.[0]
        if (!principal) throw new AppError(422, 'THESIS_CONTRIBUTORS_REQUIRED', 'Agrega un autor principal y ordena los coautores.')
        validateThesisRequiredFields({ title: body.title, author: principal.name, publicationYear: body.publicationYear, summary: body.summary })
        const thesis = await tx.thesisLink.create({ data: { title: body.title.trim(), author: principal.name, publicationYear: body.publicationYear, summary: body.summary.trim(), url, publishedAt: body.publishedAt ? new Date(body.publishedAt) : null, createdById: admin.user.id }, select: { id: true } })
        await createContributorLinks(tx, thesis.id, contributors)
        return tx.thesisLink.findUniqueOrThrow({ where: { id: thesis.id }, select: thesisSelect })
      })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new AppError(409, 'THESIS_LINK_EXISTS', 'Ya existe una tesis con esa URL del repositorio.')
      throw error
    }
  }, { body: thesisBody, response: { 201: t.Any(), 401: errorResponse, 403: errorResponse, 409: errorResponse, 422: errorResponse }, detail: { tags: ['Administración'], summary: 'Agrega un enlace de tesis', description: 'Título, año, resumen y URL HTTPS única son obligatorios. La URL se normaliza; envía contributors en orden, con el autor principal primero y los coautores después. El campo author se acepta como alias temporal para clientes anteriores.' } })
  .put('/admin/theses/:id', async ({ request, params, body }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    try {
      return await prisma.$transaction(async (tx) => {
        const current = await tx.thesisLink.findUnique({
          where: { id: params.id },
          select: { id: true, title: true, author: true, publicationYear: true, summary: true, url: true, contributors: { orderBy: { authorOrder: 'asc' }, select: { personId: true, role: true, authorOrder: true, person: { select: { id: true, name: true } } } } }
        })
        if (!current) throw new AppError(404, 'THESIS_NOT_FOUND', 'La tesis no existe.')
        const requestedContributors = await resolveRequestedContributors(
          tx,
          body,
          current.contributors.filter(({ role }) => role === 'COAUTOR').map(({ personId }) => ({ personId }))
        )
        const authorName = requestedContributors?.[0]?.name ?? current.contributors.find(({ role }) => role === 'PRINCIPAL')?.person.name ?? current.author ?? ''
        validateThesisRequiredFields({
          title: body.title ?? current.title,
          author: authorName,
          publicationYear: body.publicationYear ?? current.publicationYear,
          summary: body.summary ?? current.summary
        })
        const requiredFields = {
          title: body.title ?? current.title,
          author: authorName,
          publicationYear: body.publicationYear ?? current.publicationYear,
          summary: body.summary ?? current.summary
        }
        const url = await ensureUniqueThesisUrl(tx, body.url ?? current.url, params.id)
        if (requestedContributors) {
          await tx.thesisContributor.deleteMany({ where: { thesisId: params.id } })
          await createContributorLinks(tx, params.id, requestedContributors)
        }
        await tx.thesisLink.update({ where: { id: params.id }, data: { title: requiredFields.title!.trim(), author: requiredFields.author!.trim(), publicationYear: requiredFields.publicationYear!, summary: requiredFields.summary!.trim(), url, ...(body.publishedAt !== undefined ? { publishedAt: body.publishedAt ? new Date(body.publishedAt) : null } : {}) } })
        return tx.thesisLink.findUniqueOrThrow({ where: { id: params.id }, select: thesisSelect })
      })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') throw new AppError(404, 'THESIS_NOT_FOUND', 'La tesis no existe.')
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new AppError(409, 'THESIS_LINK_EXISTS', 'Ya existe una tesis con esa URL del repositorio.')
      throw error
    }
  }, { params: idParams, body: t.Partial(thesisBody), response: { 200: t.Any(), 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }, detail: { tags: ['Administración'], summary: 'Edita metadatos, autoría ordenada o enlace de tesis', description: 'contributors reemplaza la lista completa en una transacción. El primer autor es el principal; author sigue disponible como alias temporal para editar solo su nombre.' } })
  .delete('/admin/theses/:id', async ({ request, params }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    try { await prisma.thesisLink.delete({ where: { id: params.id } }); return { message: 'Enlace de tesis eliminado.' } }
    catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') throw new AppError(404, 'THESIS_NOT_FOUND', 'La tesis no existe.'); throw error }
  }, { params: idParams, response: { 200: t.Object({ message: t.String() }), 401: errorResponse, 403: errorResponse, 404: errorResponse }, detail: { tags: ['Administración'], summary: 'Elimina un enlace de tesis', description: 'Requiere PAPERS_MANAGE.' } })
