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

export const normalizeResourceText = (value: string, field: string, minimum: number) => {
  const normalized = cleanText(value)
  if (normalized.length < minimum) {
    throw new AppError(422, 'INVALID_RESOURCE_CONTENT', `El campo ${field} debe contener texto válido.`)
  }
  return normalized
}

const verifyCategory = async (categoryId: number) => {
  if (!await resourceRepository.findActiveCategory(categoryId)) throw new AppError(422, 'INVALID_RESOURCE_CATEGORY', 'La categoría indicada no existe o está inactiva.')
}
const verifyFile = async (fileId: number | null | undefined) => {
  if (!fileId) return
  const file = await resourceRepository.findFile(fileId)
  if (!file || !file.mimeType.trim() || !file.storageKey.trim() || file.sizeBytes <= 0n) {
    throw new AppError(422, 'INVALID_RESOURCE_FILE', 'El archivo indicado no existe o sus metadatos no son utilizables.')
  }
}
const normalizeLinks = (links: ResourceLinkInput[]) => {
  const normalized = links.map((link, index) => {
    const url = link.url.trim()
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol')
    } catch {
      throw new AppError(422, 'INVALID_RESOURCE_LINK', 'Cada enlace debe usar una URL HTTP o HTTPS válida.')
    }
    return { label: normalizeResourceText(link.label, 'label', 2), url, displayOrder: link.displayOrder ?? index }
  })
  if (new Set(normalized.map(link => link.url)).size !== normalized.length) throw new AppError(422, 'DUPLICATE_RESOURCE_LINK', 'No se permiten enlaces repetidos en un recurso.')
  return normalized
}

const withDownloadUrl = <T extends { id: number; file: object | null }>(resource: T) => resource.file
  ? { ...resource, file: { ...resource.file, downloadUrl: `/api/v1/resources/${resource.id}/download` } }
  : resource
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
    title: normalizeResourceText(input.title, 'title', 3), description: normalizeResourceText(input.description, 'description', 10), status,
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
    ...(input.title !== undefined ? { title: normalizeResourceText(input.title, 'title', 3) } : {}),
    ...(input.description !== undefined ? { description: normalizeResourceText(input.description, 'description', 10) } : {}),
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
  async publicList(query: ResourceQuery) { const result = await paginated(query, true); return { ...result, items: result.items.map(withDownloadUrl) } },
  async adminList(query: ResourceQuery) { const result = await paginated(query, false); return { ...result, items: result.items.map(withDownloadUrl) } },
  activeCategories: resourceRepository.activeCategories,
  async publicById(id: number) { const resource = await resourceRepository.findPublicById(id); return resource ? withDownloadUrl(resource) : Promise.reject(notFound()) },
  async adminById(id: number) { const resource = await resourceRepository.findById(id); return resource ? withDownloadUrl(resource) : Promise.reject(notFound()) },
  async create(input: ResourceCreateInput) { return withDownloadUrl(await resourceRepository.create(await createData(input))) },
  async update(id: number, input: ResourceUpdateInput) {
    const current = await resourceRepository.findById(id)
    if (!current) throw notFound()
    return withDownloadUrl(await resourceRepository.update(id, await updateData(current, input)))
  },
  async archive(id: number) {
    if (!await resourceRepository.findById(id)) throw notFound()
    return withDownloadUrl(await resourceRepository.update(id, { status: 'ARCHIVADO', publishedAt: null }))
  },
  async remove(id: number) {
    if (!await resourceRepository.findById(id)) throw notFound()
    return withDownloadUrl(await resourceRepository.remove(id))
  }
}
