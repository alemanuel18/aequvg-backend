import { Elysia, t } from 'elysia'
import { Prisma } from '@prisma/client'
import { requireAdmin } from '../../../middleware/admin'
import { prisma } from '../../../shared/database/prisma'
import { AppError } from '../../../shared/errors/app-error'
import { resolveThesisContributors, type ThesisContributorInput } from '../services/thesis-authors.service'
import { normalizeThesisCategoryName, normalizeThesisRepositoryUrl, validateThesisRequiredFields } from '../services/thesis.service'

const idParams = t.Object({ id: t.Integer({ minimum: 1 }) })
const thesisContributorBody = t.Object({
  personId: t.Optional(t.Integer({ minimum: 1 })),
  name: t.Optional(t.String({ minLength: 1, maxLength: 300 }))
}, { additionalProperties: false })
const thesisBody = t.Object({
  title: t.String({ minLength: 3, maxLength: 300 }),
  author: t.Optional(t.String({ minLength: 1, maxLength: 300, description: 'Alias de compatibilidad para clientes anteriores; se convierte en un autor principal.' })),
  contributors: t.Optional(t.Array(thesisContributorBody, { minItems: 1, maxItems: 50, description: 'Lista completa. El primer elemento es el autor principal; los coautores se ordenan alfabéticamente.' })),
  categoryIds: t.Optional(t.Array(t.Integer({ minimum: 1 }), { maxItems: 20, uniqueItems: true })),
  publicationYear: t.Integer({ minimum: 1900, maximum: 9999 }),
  summary: t.String({ minLength: 1, maxLength: 12000 }),
  url: t.String({ minLength: 1, maxLength: 2048, description: 'URL HTTPS única del repositorio. Se normalizan espacios externos, esquema y host; se conserva la ruta.' }),
  publishedAt: t.Optional(t.Nullable(t.String({ format: 'date-time' })))
}, { additionalProperties: false })
const listQuery = t.Object({ page: t.Optional(t.Integer({ minimum: 1 })), pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 100 })), q: t.Optional(t.String({ minLength: 1, maxLength: 160 })), categoryId: t.Optional(t.Integer({ minimum: 1 })) })
const authorQuery = t.Object({ q: t.Optional(t.String({ minLength: 1, maxLength: 160 })), page: t.Optional(t.Integer({ minimum: 1 })), pageSize: t.Optional(t.Integer({ minimum: 1, maximum: 100 })) })
const categoryCreateBody = t.Object({ name: t.String({ minLength: 2, maxLength: 80 }) })
const categoryUpdateBody = t.Object({ active: t.Boolean() })
const categoryIdParams = t.Object({ id: t.Integer({ minimum: 1 }) })
const errorResponse = t.Object({ error: t.Object({ code: t.String(), message: t.String() }) })

const thesisSelect = {
  id: true, title: true, author: true, publicationYear: true, summary: true, url: true,
  createdById: true, createdAt: true, updatedAt: true, publishedAt: true,
  contributors: {
    orderBy: { authorOrder: 'asc' as const },
    select: { personId: true, role: true, authorOrder: true, person: { select: { id: true, name: true } } }
  },
  categories: { select: { category: { select: { id: true, name: true, active: true } } } }
}

const publicThesisSelect = {
  id: true, title: true, author: true, publicationYear: true, summary: true, url: true, publishedAt: true,
  contributors: {
    orderBy: { authorOrder: 'asc' as const },
    select: { personId: true, role: true, authorOrder: true, person: { select: { id: true, name: true } } }
  },
  categories: { where: { category: { active: true } }, select: { category: { select: { id: true, name: true } } } }
}

const serializeCategories = <T extends { categories: Array<{ category: unknown }> }>(thesis: T) => ({
  ...thesis,
  categories: thesis.categories.map(({ category }) => category)
})

const validateCategoryIds = async (tx: Prisma.TransactionClient, categoryIds: number[], retainedInactiveIds: number[] = []) => {
  const uniqueIds = [...new Set(categoryIds)]
  if (uniqueIds.length !== categoryIds.length) throw new AppError(422, 'INVALID_THESIS_CATEGORY', 'No repitas categorías en una tesis.')
  const categories = await tx.thesisCategory.findMany({ where: { id: { in: uniqueIds }, OR: [{ active: true }, { id: { in: retainedInactiveIds } }] }, select: { id: true } })
  if (categories.length !== uniqueIds.length) throw new AppError(422, 'INVALID_THESIS_CATEGORY', 'Una o más categorías no existen o están inactivas.')
}

const replaceThesisCategories = async (tx: Prisma.TransactionClient, thesisId: number, categoryIds: number[], retainedInactiveIds: number[] = []) => {
  await validateCategoryIds(tx, categoryIds, retainedInactiveIds)
  await tx.thesisLinkCategory.deleteMany({ where: { thesisId } })
  if (categoryIds.length) await tx.thesisLinkCategory.createMany({ data: categoryIds.map((categoryId) => ({ thesisId, categoryId })) })
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
  .get('/theses/categories', () => prisma.thesisCategory.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }), {
    response: { 200: t.Array(t.Object({ id: t.Integer(), name: t.String() })) },
    detail: { tags: ['Tesis'], summary: 'Lista categorías activas de tesis', description: 'Devuelve las categorías públicas disponibles para consultar y filtrar tesis.' }
  })
  .get('/theses', async ({ query }) => {
    const page = query.page ?? 1, pageSize = query.pageSize ?? 20
    const search = query.q?.trim()
    const where = {
      publishedAt: { not: null, lte: new Date() },
      ...(query.categoryId ? { categories: { some: { categoryId: query.categoryId, category: { active: true } } } } : {}),
      ...(search ? { OR: [
        { title: { contains: search, mode: 'insensitive' as const } },
        { author: { contains: search, mode: 'insensitive' as const } },
        { contributors: { some: { person: { name: { contains: search, mode: 'insensitive' as const } } } } },
        { categories: { some: { category: { active: true, name: { contains: search, mode: 'insensitive' as const } } } } },
        { summary: { contains: search, mode: 'insensitive' as const } }
      ] } : {})
    }
    const [items, total] = await Promise.all([
      prisma.thesisLink.findMany({ where, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize, select: publicThesisSelect }),
      prisma.thesisLink.count({ where })
    ])
    return { items: items.map(serializeCategories), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }
  }, { query: listQuery, response: { 200: t.Any() }, detail: { tags: ['Tesis'], summary: 'Lista tesis publicadas', description: 'Consulta pública paginada y filtrable por categoría activa. Incluye categorías activas, autores ordenados y el alias temporal author.' } })
  .get('/theses/:id', async ({ params }) => {
    const thesis = await prisma.thesisLink.findFirst({ where: { id: params.id, publishedAt: { not: null, lte: new Date() } }, select: publicThesisSelect })
    if (!thesis) throw new AppError(404, 'THESIS_NOT_FOUND', 'La tesis no existe o no está publicada.')
    return serializeCategories(thesis)
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
  .get('/admin/theses/categories', async ({ request }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    return prisma.thesisCategory.findMany({ select: { id: true, name: true, active: true }, orderBy: [{ active: 'desc' }, { name: 'asc' }] })
  }, { response: { 200: t.Array(t.Object({ id: t.Integer(), name: t.String(), active: t.Boolean() })), 401: errorResponse, 403: errorResponse }, detail: { tags: ['Administración'], summary: 'Lista categorías administrativas de tesis', description: 'Incluye categorías activas e inactivas. Requiere PAPERS_MANAGE.' } })
  .post('/admin/theses/categories', async ({ request, body, set }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    const name = normalizeThesisCategoryName(body.name)
    try {
      set.status = 201
      return await prisma.thesisCategory.create({ data: { name }, select: { id: true, name: true, active: true } })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'THESIS_CATEGORY_EXISTS', 'Ya existe una categoría con ese nombre.')
      throw error
    }
  }, { body: categoryCreateBody, response: { 201: t.Object({ id: t.Integer(), name: t.String(), active: t.Boolean() }), 401: errorResponse, 403: errorResponse, 409: errorResponse, 422: errorResponse }, detail: { tags: ['Administración'], summary: 'Crea una categoría de tesis', description: 'Requiere PAPERS_MANAGE y un nombre único de 2 a 80 caracteres.' } })
  .patch('/admin/theses/categories/:id', async ({ request, params, body }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    try { return await prisma.thesisCategory.update({ where: { id: params.id }, data: { active: body.active }, select: { id: true, name: true, active: true } }) }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new AppError(404, 'THESIS_CATEGORY_NOT_FOUND', 'La categoría no existe.'); throw error }
  }, { params: categoryIdParams, body: categoryUpdateBody, response: { 200: t.Object({ id: t.Integer(), name: t.String(), active: t.Boolean() }), 401: errorResponse, 403: errorResponse, 404: errorResponse }, detail: { tags: ['Administración'], summary: 'Activa o desactiva una categoría de tesis', description: 'Desactivar una categoría la oculta del sitio público y la conserva en tesis ya asignadas.' } })
  .get('/admin/theses', async ({ request, query }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    const page = query.page ?? 1, pageSize = query.pageSize ?? 20
    const where = query.categoryId ? { categories: { some: { categoryId: query.categoryId } } } : {}
    const [items, total] = await Promise.all([
      prisma.thesisLink.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize, select: { ...thesisSelect, createdBy: { select: { id: true, name: true } } } }),
      prisma.thesisLink.count({ where })
    ])
    return { items: items.map(serializeCategories), pagination: { page, pageSize, total } }
  }, { query: listQuery, response: { 200: t.Any(), 401: errorResponse, 403: errorResponse }, detail: { tags: ['Administración'], summary: 'Lista enlaces de tesis', description: 'Incluye autores ordenados y el alias temporal author. Requiere PAPERS_MANAGE; no consulta ni almacena documentos.' } })
  .post('/admin/theses', async ({ request, body, set }) => {
    const admin = await requireAdmin(request, 'PAPERS_MANAGE')
    validateThesisRequiredFields(body)
    if (body.author === undefined && body.contributors === undefined) {
      throw new AppError(422, 'THESIS_CONTRIBUTORS_REQUIRED', 'Agrega un autor principal y sus coautores.')
    }
    set.status = 201
    try {
      return await prisma.$transaction(async (tx) => {
        const url = await ensureUniqueThesisUrl(tx, body.url)
        const categoryIds = body.categoryIds ?? []
        await validateCategoryIds(tx, categoryIds)
        const contributors = await resolveRequestedContributors(tx, body)
        const principal = contributors?.[0]
        if (!principal) throw new AppError(422, 'THESIS_CONTRIBUTORS_REQUIRED', 'Agrega un autor principal y sus coautores.')
        validateThesisRequiredFields({ title: body.title, author: principal.name, publicationYear: body.publicationYear, summary: body.summary })
        const thesis = await tx.thesisLink.create({ data: { title: body.title.trim(), author: principal.name, publicationYear: body.publicationYear, summary: body.summary.trim(), url, publishedAt: body.publishedAt ? new Date(body.publishedAt) : null, createdById: admin.user.id }, select: { id: true } })
        await createContributorLinks(tx, thesis.id, contributors)
        if (categoryIds.length) await tx.thesisLinkCategory.createMany({ data: categoryIds.map((categoryId) => ({ thesisId: thesis.id, categoryId })) })
        return serializeCategories(await tx.thesisLink.findUniqueOrThrow({ where: { id: thesis.id }, select: thesisSelect }))
      })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new AppError(409, 'THESIS_LINK_EXISTS', 'Ya existe una tesis con esa URL del repositorio.')
      throw error
    }
  }, { body: thesisBody, response: { 201: t.Any(), 401: errorResponse, 403: errorResponse, 409: errorResponse, 422: errorResponse }, detail: { tags: ['Administración'], summary: 'Agrega un enlace de tesis', description: 'Título, año, resumen y URL HTTPS única son obligatorios. La URL se normaliza; el autor principal aparece primero y los coautores se ordenan alfabéticamente. El campo author se acepta como alias temporal para clientes anteriores.' } })
  .put('/admin/theses/:id', async ({ request, params, body }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    try {
      return await prisma.$transaction(async (tx) => {
        const current = await tx.thesisLink.findUnique({
          where: { id: params.id },
          select: { id: true, title: true, author: true, publicationYear: true, summary: true, url: true, contributors: { orderBy: { authorOrder: 'asc' }, select: { personId: true, role: true, authorOrder: true, person: { select: { id: true, name: true } } } }, categories: { select: { categoryId: true, category: { select: { active: true } } } } }
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
        if (body.categoryIds !== undefined) {
          const retainedInactiveIds = current.categories.filter(({ category }) => !category.active).map(({ categoryId }) => categoryId)
          await replaceThesisCategories(tx, params.id, body.categoryIds, retainedInactiveIds)
        }
        await tx.thesisLink.update({ where: { id: params.id }, data: { title: requiredFields.title!.trim(), author: requiredFields.author!.trim(), publicationYear: requiredFields.publicationYear!, summary: requiredFields.summary!.trim(), url, ...(body.publishedAt !== undefined ? { publishedAt: body.publishedAt ? new Date(body.publishedAt) : null } : {}) } })
        return serializeCategories(await tx.thesisLink.findUniqueOrThrow({ where: { id: params.id }, select: thesisSelect }))
      })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') throw new AppError(404, 'THESIS_NOT_FOUND', 'La tesis no existe.')
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') throw new AppError(409, 'THESIS_LINK_EXISTS', 'Ya existe una tesis con esa URL del repositorio.')
      throw error
    }
  }, { params: idParams, body: t.Partial(thesisBody), response: { 200: t.Any(), 401: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse, 422: errorResponse }, detail: { tags: ['Administración'], summary: 'Edita metadatos, autores o enlace de tesis', description: 'contributors reemplaza la lista completa en una transacción. El autor principal aparece primero y los coautores se ordenan alfabéticamente; author sigue disponible como alias temporal para editar solo el nombre principal.' } })
  .delete('/admin/theses/:id', async ({ request, params }) => {
    await requireAdmin(request, 'PAPERS_MANAGE')
    try { await prisma.thesisLink.delete({ where: { id: params.id } }); return { message: 'Enlace de tesis eliminado.' } }
    catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === 'P2025') throw new AppError(404, 'THESIS_NOT_FOUND', 'La tesis no existe.'); throw error }
  }, { params: idParams, response: { 200: t.Object({ message: t.String() }), 401: errorResponse, 403: errorResponse, 404: errorResponse }, detail: { tags: ['Administración'], summary: 'Elimina un enlace de tesis', description: 'Requiere PAPERS_MANAGE.' } })
