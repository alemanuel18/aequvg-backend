import type { ContentStatus, Prisma } from '@prisma/client'
import { AppError } from '../../../shared/errors/app-error'
import { cleanText } from '../../../shared/utils/text'
import { resourceRepository } from '../repositories/resource.repository'

type ResourceLinkInput = { label: string; url: string; displayOrder?: number }
export type ResourceCreateInput = { createdById: number; categoryId: number; fileId?: number | null; title: string; description: string; status?: ContentStatus; publishedAt?: string | null; links?: ResourceLinkInput[] }
export type ResourceUpdateInput = { categoryId?: number; fileId?: number | null; title?: string; description?: string; status?: ContentStatus; publishedAt?: string | null; links?: ResourceLinkInput[] }
export type ResourceQuery = { q?: string; categoryId?: number; status?: ContentStatus; page?: number; pageSize?: number }

const notFound = () => new AppError(404, 'RESOURCE_NOT_FOUND', 'El recurso solicitado no existe.')
const publicationDate = (status: ContentStatus, requested: string | null | undefined, current: Date | null = null) => status === 'PUBLICADO' ? (requested ? new Date(requested) : current ?? new Date()) : null

const verifyCategory = async (categoryId: number) => {
  if (!await resourceRepository.findActiveCategory(categoryId)) throw new AppError(422, 'INVALID_RESOURCE_CATEGORY', 'La categoría indicada no existe o está inactiva.')
}
const verifyFile = async (fileId: number | null | undefined) => {
  if (fileId && !await resourceRepository.findFile(fileId)) throw new AppError(422, 'INVALID_RESOURCE_FILE', 'El archivo indicado no existe.')
}
const normalizeLinks = (links: ResourceLinkInput[]) => {
  const normalized = links.map((link, index) => ({ label: cleanText(link.label), url: link.url.trim(), displayOrder: link.displayOrder ?? index }))
  if (new Set(normalized.map(link => link.url)).size !== normalized.length) throw new AppError(422, 'DUPLICATE_RESOURCE_LINK', 'No se permiten enlaces repetidos en un recurso.')
  return normalized
}
const verifyDestination = (status: ContentStatus, fileId: number | null, links: ResourceLinkInput[]) => {
  if (status === 'PUBLICADO' && !fileId && !links.length) throw new AppError(422, 'RESOURCE_DESTINATION_REQUIRED', 'Un recurso publicado requiere un archivo o al menos un enlace.')
}

const createData = async (input: ResourceCreateInput): Promise<Prisma.ResourceCreateInput> => {
  if (!await resourceRepository.findActiveUser(input.createdById)) throw new AppError(422, 'INVALID_RESOURCE_AUTHOR', 'El autor indicado no existe o no está activo.')
  await Promise.all([verifyCategory(input.categoryId), verifyFile(input.fileId)])
  const status = input.status ?? 'BORRADOR'
  const links = normalizeLinks(input.links ?? [])
  const fileId = input.fileId ?? null
  verifyDestination(status, fileId, links)
  return {
    createdBy: { connect: { id: input.createdById } },
    category: { connect: { id: input.categoryId } },
    ...(fileId ? { file: { connect: { id: fileId } } } : {}),
    title: cleanText(input.title), description: cleanText(input.description), status,
    publishedAt: publicationDate(status, input.publishedAt),
    ...(links.length ? { links: { create: links } } : {})
  }
}

const updateData = async (current: { categoryId: number; fileId: number | null; status: ContentStatus; publishedAt: Date | null; links: ResourceLinkInput[] }, input: ResourceUpdateInput): Promise<Prisma.ResourceUpdateInput> => {
  const categoryId = input.categoryId ?? current.categoryId
  const fileId = input.fileId === undefined ? current.fileId : input.fileId
  const status = input.status ?? current.status
  const links = normalizeLinks(input.links ?? current.links)
  await Promise.all([verifyCategory(categoryId), verifyFile(fileId)])
  verifyDestination(status, fileId, links)
  return {
    ...(input.categoryId !== undefined ? { category: { connect: { id: categoryId } } } : {}),
    ...(input.fileId !== undefined ? (fileId ? { file: { connect: { id: fileId } } } : { file: { disconnect: true } }) : {}),
    ...(input.title !== undefined ? { title: cleanText(input.title) } : {}),
    ...(input.description !== undefined ? { description: cleanText(input.description) } : {}),
    ...(input.status !== undefined ? { status } : {}),
    publishedAt: publicationDate(status, input.publishedAt, current.publishedAt),
    ...(input.links !== undefined ? { links: { deleteMany: {}, create: links } } : {})
  }
}

const paginated = async (query: ResourceQuery, publishedOnly: boolean) => {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 20
  const filters = { q: query.q ? cleanText(query.q) : undefined, categoryId: query.categoryId, status: query.status, publishedOnly, page, pageSize }
  const [items, total] = await Promise.all([resourceRepository.list(filters), resourceRepository.count(filters)])
  return { items, pagination: { page, pageSize, total } }
}

export const resourceService = {
  publicList: (query: ResourceQuery) => paginated(query, true),
  adminList: (query: ResourceQuery) => paginated(query, false),
  activeCategories: resourceRepository.activeCategories,
  async publicById(id: number) { return await resourceRepository.findPublicById(id) ?? Promise.reject(notFound()) },
  async adminById(id: number) { return await resourceRepository.findById(id) ?? Promise.reject(notFound()) },
  async create(input: ResourceCreateInput) { return resourceRepository.create(await createData(input)) },
  async update(id: number, input: ResourceUpdateInput) {
    const current = await resourceRepository.findById(id)
    if (!current) throw notFound()
    return resourceRepository.update(id, await updateData(current, input))
  },
  async archive(id: number) {
    if (!await resourceRepository.findById(id)) throw notFound()
    return resourceRepository.update(id, { status: 'ARCHIVADO', publishedAt: null })
  },
  async remove(id: number) {
    if (!await resourceRepository.findById(id)) throw notFound()
    return resourceRepository.remove(id)
  }
}
