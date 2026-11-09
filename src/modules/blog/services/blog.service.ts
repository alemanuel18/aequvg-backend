import { Prisma, type ContentStatus } from '@prisma/client'
import { AppError } from '../../../shared/errors/app-error'
import { cleanText } from '../../../shared/utils/text'
import { blogRepository } from '../repositories/blog.repository'

type CreateInput = { createdById: number; imageId?: number | null; title: string; slug?: string; summary: string; content: string; status?: ContentStatus; publishedAt?: string | null }
type UpdateInput = Partial<Omit<CreateInput, 'createdById'>>
type Query = { q?: string; status?: ContentStatus; page?: number; pageSize?: number }
const notFound = () => new AppError(404, 'BLOG_POST_NOT_FOUND', 'La entrada solicitada no existe.')
const normalizeText = (value: string, field: string, minimum: number) => {
  const text = cleanText(value)
  if (text.length < minimum) throw new AppError(422, 'INVALID_BLOG_CONTENT', `El campo ${field} debe contener texto válido.`)
  return text
}
const slugify = (value: string) => cleanText(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 240).replace(/-+$/g, '')
const publicationDate = (status: ContentStatus, requested: string | null | undefined, current: Date | null = null) => status !== 'PUBLICADO' ? null : requested ? new Date(requested) : current ?? new Date()
const verifyImage = async (id: number | null | undefined) => {
  if (!id) return
  const image = await blogRepository.image(id)
  if (!image || !image.mimeType.toLowerCase().startsWith('image/')) throw new AppError(422, 'INVALID_BLOG_IMAGE', 'La imagen indicada no existe o no es válida.')
}
const createData = async (input: CreateInput): Promise<Prisma.BlogPostUncheckedCreateInput> => {
  if (!await blogRepository.activeUser(input.createdById)) throw new AppError(422, 'INVALID_BLOG_AUTHOR', 'El autor no existe o no está activo.')
  await verifyImage(input.imageId)
  const status = input.status ?? 'BORRADOR'
  const title = normalizeText(input.title, 'title', 3)
  const slug = input.slug ? slugify(input.slug) : slugify(title)
  if (slug.length < 3) throw new AppError(422, 'INVALID_BLOG_SLUG', 'El slug debe contener al menos 3 caracteres válidos.')
  return { createdById: input.createdById, imageId: input.imageId ?? null, title, slug, summary: normalizeText(input.summary, 'summary', 10), content: normalizeText(input.content, 'content', 20), status, publishedAt: publicationDate(status, input.publishedAt) }
}
const updateData = async (current: { imageId: number | null; title: string; slug: string; status: ContentStatus; publishedAt: Date | null }, input: UpdateInput): Promise<Prisma.BlogPostUncheckedUpdateInput> => {
  const status = input.status ?? current.status
  const title = input.title === undefined ? current.title : normalizeText(input.title, 'title', 3)
  const slug = input.slug !== undefined ? slugify(input.slug) : current.slug
  if (slug.length < 3) throw new AppError(422, 'INVALID_BLOG_SLUG', 'El slug debe contener al menos 3 caracteres válidos.')
  await verifyImage(input.imageId === undefined ? current.imageId : input.imageId)
  return {
    ...(input.imageId !== undefined ? { imageId: input.imageId } : {}),
    ...(input.title !== undefined ? { title } : {}), ...(input.slug !== undefined || input.title !== undefined ? { slug } : {}),
    ...(input.summary !== undefined ? { summary: normalizeText(input.summary, 'summary', 10) } : {}),
    ...(input.content !== undefined ? { content: normalizeText(input.content, 'content', 20) } : {}),
    ...(input.status !== undefined ? { status } : {}), publishedAt: publicationDate(status, input.publishedAt, current.publishedAt)
  }
}
const paginated = async (query: Query, publishedOnly: boolean) => {
  const page = query.page ?? 1, pageSize = query.pageSize ?? 20
  const filters = { q: query.q ? cleanText(query.q) : undefined, status: publishedOnly ? undefined : query.status, publishedOnly, page, pageSize }
  const [items, total] = await Promise.all([blogRepository.list(filters), blogRepository.count(filters)])
  return { items, pagination: { page, pageSize, total } }
}
export const blogService = {
  publicList: (query: Query) => paginated(query, true), adminList: (query: Query) => paginated(query, false),
  async publicBySlug(slug: string) { return await blogRepository.bySlug(slug) ?? Promise.reject(notFound()) },
  async adminById(id: number) { return await blogRepository.byId(id) ?? Promise.reject(notFound()) },
  async create(input: CreateInput) {
    try { return await blogRepository.create(await createData(input)) }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'BLOG_SLUG_EXISTS', 'Ya existe una entrada con ese slug.'); throw error }
  },
  async update(id: number, input: UpdateInput) {
    const current = await blogRepository.byId(id); if (!current) throw notFound()
    try { return await blogRepository.update(id, await updateData(current, input)) }
    catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, 'BLOG_SLUG_EXISTS', 'Ya existe una entrada con ese slug.'); throw error }
  },
  async archive(id: number) { if (!await blogRepository.byId(id)) throw notFound(); return blogRepository.update(id, { status: 'ARCHIVADO', publishedAt: null }) },
  async remove(id: number) { if (!await blogRepository.byId(id)) throw notFound(); return blogRepository.remove(id) }
}
