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
const allowedHtmlTags = new Set(['p', 'div', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'blockquote', 'hr', 'img'])
const voidHtmlTags = new Set(['br', 'hr', 'img'])
const escapeHtmlText = (value: string) => value
  .replace(/&(?!#\d+;|#x[\da-f]+;|[a-z][\da-z]+;)/gi, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
const escapeHtmlAttribute = (value: string) => escapeHtmlText(value).replace(/"/g, '&quot;')
const attributeValue = (source: string, name: string) => {
  const attribute = source.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i'))
  return attribute?.[1] ?? attribute?.[2] ?? attribute?.[3] ?? ''
}
export const sanitizeBlogContent = (value: string) => {
  const input = value.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|iframe|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  const tagPattern = /<\/?([a-z][a-z\d]*)\b([^>]*)>/gi
  let output = ''
  let cursor = 0
  for (const match of input.matchAll(tagPattern)) {
    const index = match.index ?? 0
    output += escapeHtmlText(input.slice(cursor, index))
    cursor = index + match[0].length
    const tag = match[1]!.toLowerCase()
    if (!allowedHtmlTags.has(tag)) continue
    const closing = match[0].startsWith('</')
    if (tag === 'img') {
      if (closing) continue
      const imageId = Number(attributeValue(match[2]!, 'data-image-id'))
      if (Number.isSafeInteger(imageId) && imageId > 0) {
        const alt = escapeHtmlAttribute(attributeValue(match[2]!, 'alt').slice(0, 300))
        output += `<img data-image-id="${imageId}" alt="${alt}">`
      }
      continue
    }
    if (closing) {
      if (!voidHtmlTags.has(tag)) output += `</${tag}>`
      continue
    }
    let alignment = ''
    const style = attributeValue(match[2]!, 'style')
    const alignMatch = style.match(/(?:^|;)\s*text-align\s*:\s*(left|right|center|justify)\s*(?:;|$)/i)
    if (alignMatch) alignment = ` style="text-align: ${alignMatch[1]!.toLowerCase()}"`
    output += `<${tag}${alignment}>`
  }
  output += escapeHtmlText(input.slice(cursor))
  return output.trim()
}
const blogImageIds = (content: string) => [...new Set([...content.matchAll(/<img data-image-id="(\d+)"/g)].map(match => Number(match[1])))]
const validateBlogContent = (value: string) => {
  const content = sanitizeBlogContent(value)
  const text = cleanText(content.replace(/<[^>]*>/g, ' '))
  if (text.length < 20) throw new AppError(422, 'INVALID_BLOG_CONTENT', 'El contenido debe incluir al menos 20 caracteres de texto.')
  const imageIds = blogImageIds(content)
  if (imageIds.length > 20) throw new AppError(422, 'TOO_MANY_BLOG_IMAGES', 'Cada entrada puede incluir hasta 20 imágenes dentro del contenido.')
  return { content, imageIds }
}
const publicContent = (slug: string, content: string) => content.replace(/<img data-image-id="(\d+)"/g, `<img data-image-id="$1" src="/api/v1/blog/${encodeURIComponent(slug)}/images/$1"`)
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
  const content = validateBlogContent(input.content)
  await Promise.all([verifyImage(input.imageId), ...content.imageIds.map(verifyImage)])
  return { createdById: input.createdById, imageId: input.imageId ?? null, title, slug, summary: normalizeText(input.summary, 'summary', 10), content: content.content, status, publishedAt: publicationDate(status, input.publishedAt) }
}
const updateData = async (current: { imageId: number | null; title: string; slug: string; status: ContentStatus; publishedAt: Date | null }, input: UpdateInput): Promise<Prisma.BlogPostUncheckedUpdateInput> => {
  const status = input.status ?? current.status
  const title = input.title === undefined ? current.title : normalizeText(input.title, 'title', 3)
  const slug = input.slug !== undefined ? slugify(input.slug) : current.slug
  if (slug.length < 3) throw new AppError(422, 'INVALID_BLOG_SLUG', 'El slug debe contener al menos 3 caracteres válidos.')
  const content = input.content === undefined ? null : validateBlogContent(input.content)
  await Promise.all([
    verifyImage(input.imageId === undefined ? current.imageId : input.imageId),
    ...(content?.imageIds.map(verifyImage) ?? [])
  ])
  return {
    ...(input.imageId !== undefined ? { imageId: input.imageId } : {}),
    ...(input.title !== undefined ? { title } : {}), ...(input.slug !== undefined || input.title !== undefined ? { slug } : {}),
    ...(input.summary !== undefined ? { summary: normalizeText(input.summary, 'summary', 10) } : {}),
    ...(content ? { content: content.content } : {}),
    ...(input.status !== undefined ? { status } : {}), publishedAt: publicationDate(status, input.publishedAt, current.publishedAt)
  }
}
const paginated = async (query: Query, publishedOnly: boolean) => {
  const page = query.page ?? 1, pageSize = query.pageSize ?? 20
  const filters = { q: query.q ? cleanText(query.q) : undefined, status: publishedOnly ? undefined : query.status, publishedOnly, page, pageSize }
  const [items, total] = await Promise.all([blogRepository.list(filters), blogRepository.count(filters)])
  return { items: publishedOnly ? items.map(post => ({ ...post, content: publicContent(post.slug, post.content) })) : items, pagination: { page, pageSize, total } }
}
export const blogService = {
  publicList: (query: Query) => paginated(query, true), adminList: (query: Query) => paginated(query, false),
  async publicBySlug(slug: string) {
    const post = await blogRepository.bySlug(slug)
    if (!post) throw notFound()
    return { ...post, content: publicContent(post.slug, post.content) }
  },
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
