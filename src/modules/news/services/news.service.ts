import type { ContentStatus, Prisma } from '@prisma/client'
import { AppError } from '../../../shared/errors/app-error'
import { cleanText } from '../../../shared/utils/text'
import { newsRepository } from '../repositories/news.repository'

export type NewsCreateInput = { createdById: number; categoryId: number; imageId?: number | null; title: string; summary: string; content: string; status?: ContentStatus; publishedAt?: string | null }
export type NewsUpdateInput = { categoryId?: number; imageId?: number | null; title?: string; summary?: string; content?: string; status?: ContentStatus; publishedAt?: string | null }
export type NewsQuery = { q?: string; categoryId?: number; status?: ContentStatus; page?: number; pageSize?: number }

const notFound = () => new AppError(404, 'NEWS_NOT_FOUND', 'La noticia solicitada no existe.')

export const publicationDate = (status: ContentStatus, requested: string | null | undefined, current: Date | null = null) => {
  if (status !== 'PUBLICADO') return null
  if (requested) return new Date(requested)
  return current ?? new Date()
}

const verifyCategory = async (categoryId: number) => {
  if (!await newsRepository.findActiveCategory(categoryId)) throw new AppError(422, 'INVALID_NEWS_CATEGORY', 'La categoría indicada no existe o está inactiva.')
}

const verifyImage = async (imageId: number | null | undefined) => {
  if (!imageId) return
  const image = await newsRepository.findImage(imageId)
  if (!image || !image.mimeType.startsWith('image/')) throw new AppError(422, 'INVALID_NEWS_IMAGE', 'La imagen indicada no existe o no es válida.')
}

const createData = async (input: NewsCreateInput): Promise<Prisma.NewsUncheckedCreateInput> => {
  if (!await newsRepository.findActiveUser(input.createdById)) throw new AppError(422, 'INVALID_NEWS_AUTHOR', 'El autor indicado no existe o no está activo.')
  await Promise.all([verifyCategory(input.categoryId), verifyImage(input.imageId)])
  const status = input.status ?? 'BORRADOR'
  return { createdById: input.createdById, categoryId: input.categoryId, imageId: input.imageId ?? null, title: cleanText(input.title), summary: cleanText(input.summary), content: cleanText(input.content), status, publishedAt: publicationDate(status, input.publishedAt) }
}

const updateData = async (current: { categoryId: number; imageId: number | null; status: ContentStatus; publishedAt: Date | null }, input: NewsUpdateInput): Promise<Prisma.NewsUncheckedUpdateInput> => {
  const categoryId = input.categoryId ?? current.categoryId
  const imageId = input.imageId === undefined ? current.imageId : input.imageId
  const status = input.status ?? current.status
  await Promise.all([verifyCategory(categoryId), verifyImage(imageId)])
  return {
    ...(input.categoryId !== undefined ? { categoryId } : {}),
    ...(input.imageId !== undefined ? { imageId } : {}),
    ...(input.title !== undefined ? { title: cleanText(input.title) } : {}),
    ...(input.summary !== undefined ? { summary: cleanText(input.summary) } : {}),
    ...(input.content !== undefined ? { content: cleanText(input.content) } : {}),
    ...(input.status !== undefined ? { status } : {}),
    publishedAt: publicationDate(status, input.publishedAt, current.publishedAt)
  }
}

const paginated = async (query: NewsQuery, publishedOnly: boolean) => {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const filters = { q: query.q ? cleanText(query.q) : undefined, categoryId: query.categoryId, status: query.status, publishedOnly, page, pageSize }
  const [items, total] = await Promise.all([newsRepository.list(filters), newsRepository.count(filters)])
  return { items, pagination: { page, pageSize, total } }
}

export const newsService = {
  publicList: (query: NewsQuery) => paginated(query, true),
  adminList: (query: NewsQuery) => paginated(query, false),
  activeCategories: newsRepository.activeCategories,
  async publicById(id: number) { return await newsRepository.findPublicById(id) ?? Promise.reject(notFound()) },
  async adminById(id: number) { return await newsRepository.findById(id) ?? Promise.reject(notFound()) },
  async create(input: NewsCreateInput) { return newsRepository.create(await createData(input)) },
  async update(id: number, input: NewsUpdateInput) {
    const current = await newsRepository.findById(id)
    if (!current) throw notFound()
    return newsRepository.update(id, await updateData(current, input))
  },
  async archive(id: number) {
    if (!await newsRepository.findById(id)) throw notFound()
    return newsRepository.update(id, { status: 'ARCHIVADO', publishedAt: null })
  },
  async remove(id: number) {
    if (!await newsRepository.findById(id)) throw notFound()
    return newsRepository.remove(id)
  }
}
