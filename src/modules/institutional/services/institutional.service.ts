import type { InstitutionalBlockType, ContentStatus } from '@prisma/client'
import { AppError } from '../../../shared/errors/app-error'
import { cleanText, isHttpUrl } from '../../../shared/utils/text'
import { eventsRepository } from '../../events/repositories/events.repository'
import { institutionalRepository } from '../repositories/institutional.repository'

export type BlockInput = {
  type: InstitutionalBlockType
  title: string
  subtitle?: string | null
  body: string
  imageUrl?: string | null
  actionLabel?: string | null
  actionUrl?: string | null
  displayOrder?: number
  status?: ContentStatus
}

export type FeaturedInput = {
  newsIds: number[]
  eventIds: number[]
}

const normalizeRequiredText = (value: string, field: string) => {
  const normalized = cleanText(value)
  if (normalized.length < 2) {
    throw new AppError(422, 'INVALID_INSTITUTIONAL_CONTENT', `El campo ${field} debe contener texto válido.`)
  }
  return normalized
}

const normalizeOptionalText = (value?: string | null) => {
  if (!value) return null
  const normalized = cleanText(value)
  return normalized || null
}

const normalize = (input: BlockInput, current?: { status: ContentStatus; publishedAt: Date | null }) => {
  if (input.imageUrl && !isHttpUrl(input.imageUrl)) {
    throw new AppError(422, 'INVALID_IMAGE_URL', 'La URL de imagen debe usar HTTP o HTTPS.')
  }
  if (input.actionUrl && !isHttpUrl(input.actionUrl) && !input.actionUrl.startsWith('/')) {
    throw new AppError(422, 'INVALID_ACTION_URL', 'El enlace de acción no es válido.')
  }
  const status = input.status ?? current?.status ?? 'BORRADOR'
  return {
    ...input,
    title: normalizeRequiredText(input.title, 'title'),
    subtitle: normalizeOptionalText(input.subtitle),
    body: normalizeRequiredText(input.body, 'body'),
    actionLabel: normalizeOptionalText(input.actionLabel),
    displayOrder: input.displayOrder ?? 0,
    status,
    publishedAt: status === 'PUBLICADO' ? current?.publishedAt ?? new Date() : null
  }
}

export const institutionalService = {
  publicList: institutionalRepository.listPublished,

  adminList: institutionalRepository.listAll,

  create: async (input: BlockInput) => {
    const data = normalize(input)
    if (data.type !== 'HERO' && data.status === 'PUBLICADO') {
      const activeCount = await institutionalRepository.countActiveAnnouncements()
      if (activeCount >= 3) {
        throw new AppError(422, 'ANNOUNCEMENT_LIMIT_EXCEEDED', 'No se pueden tener más de 3 anuncios activos en Conocer la Licenciatura de Química.')
      }
    }
    return institutionalRepository.create(data)
  },

  update: async (id: number, input: BlockInput) => {
    const existing = await institutionalRepository.findById(id)
    if (!existing) {
      throw new AppError(404, 'BLOCK_NOT_FOUND', 'El bloque institucional no existe.')
    }
    const data = normalize(input, existing)
    if (data.type !== 'HERO' && data.status === 'PUBLICADO') {
      const activeCount = await institutionalRepository.countActiveAnnouncements(id)
      if (activeCount >= 3) {
        throw new AppError(422, 'ANNOUNCEMENT_LIMIT_EXCEEDED', 'No se pueden tener más de 3 anuncios activos en Conocer la Licenciatura de Química.')
      }
    }
    return institutionalRepository.update(id, data)
  },

  archive: async (id: number) => {
    const existing = await institutionalRepository.findById(id)
    if (!existing) {
      throw new AppError(404, 'BLOCK_NOT_FOUND', 'El bloque institucional no existe.')
    }
    return institutionalRepository.archive(id)
  },

  publicFeatured: async () => {
    const items = await institutionalRepository.listFeatured()
    const news = items
      .filter(item => item.news && item.news.status === 'PUBLICADO')
      .map(item => item.news!)

    const rawEvents = items
      .filter(item => item.event && item.event.status === 'PUBLICADO')
      .map(item => item.event!)

    const eventIds = rawEvents.map(e => e.id)
    const countMap = eventIds.length > 0 ? await eventsRepository.countConfirmedByEventIds(eventIds) : new Map<number, number>()

    const events = rawEvents.map(event => ({
      ...event,
      availableCapacity: Math.max(0, event.maximumCapacity - (countMap.get(event.id) ?? 0))
    }))

    return { news, events }
  },

  adminFeatured: async () => {
    const items = await institutionalRepository.listFeatured()
    const newsIds = items.filter(item => item.newsId !== null).map(item => item.newsId!)
    const eventIds = items.filter(item => item.eventId !== null).map(item => item.eventId!)
    return { newsIds, eventIds }
  },

  saveFeatured: async (input: FeaturedInput) => {
    if (input.newsIds.length > 3) {
      throw new AppError(422, 'FEATURED_LIMIT_EXCEEDED', 'No se pueden destacar más de 3 noticias.')
    }
    if (input.eventIds.length > 3) {
      throw new AppError(422, 'FEATURED_LIMIT_EXCEEDED', 'No se pueden destacar más de 3 eventos.')
    }
    if (new Set(input.newsIds).size !== input.newsIds.length) {
      throw new AppError(422, 'DUPLICATE_FEATURED', 'No se pueden incluir noticias duplicadas.')
    }
    if (new Set(input.eventIds).size !== input.eventIds.length) {
      throw new AppError(422, 'DUPLICATE_FEATURED', 'No se pueden incluir eventos duplicados.')
    }

    if (input.newsIds.length > 0) {
      const existingNews = await institutionalRepository.findExistingNews(input.newsIds)
      if (existingNews.length !== input.newsIds.length) {
        throw new AppError(422, 'INVALID_FEATURED_NEWS', 'Una o más noticias seleccionadas no existen.')
      }
    }

    if (input.eventIds.length > 0) {
      const existingEvents = await institutionalRepository.findExistingEvents(input.eventIds)
      if (existingEvents.length !== input.eventIds.length) {
        throw new AppError(422, 'INVALID_FEATURED_EVENT', 'Uno o más eventos seleccionados no existen.')
      }
    }

    return institutionalRepository.saveFeatured(input.newsIds, input.eventIds)
  }
}
