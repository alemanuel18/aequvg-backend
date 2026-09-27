import type { EventStatus, Prisma } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'
import { AppError } from '../../../shared/errors/app-error'
import { cleanText } from '../../../shared/utils/text'
import { eventRegistrationsRepository } from '../repositories/event-registrations.repository'
import { eventsRepository } from '../repositories/events.repository'

export type EventCreateInput = {
  createdById: number
  imageId?: number | null
  name: string
  description: string
  startsAt: string
  location: string
  maximumCapacity: number
  additionalInformation?: string | null
  status?: EventStatus
}

export type EventUpdateInput = {
  imageId?: number | null
  name?: string
  description?: string
  startsAt?: string
  location?: string
  maximumCapacity?: number
  additionalInformation?: string | null
  status?: EventStatus
}

export type EventQuery = {
  q?: string
  status?: EventStatus
  page?: number
  pageSize?: number
}

export type EventPublicQuery = {
  q?: string
  page?: number
  pageSize?: number
}

const notFound = () => new AppError(404, 'EVENT_NOT_FOUND', 'El evento solicitado no existe.')

const verifyAuthor = async (userId: number) => {
  const author = await eventsRepository.findActiveUser(userId)
  if (!author) {
    throw new AppError(422, 'INVALID_EVENT_AUTHOR', 'El autor indicado no existe o no está activo.')
  }
}

const verifyImage = async (imageId: number | null | undefined) => {
  if (!imageId) return
  const image = await eventsRepository.findImage(imageId)
  if (!image || !image.mimeType.startsWith('image/')) {
    throw new AppError(422, 'INVALID_EVENT_IMAGE', 'La imagen indicada no existe o no es válida.')
  }
}

const parseStartsAt = (value: string) => {
  const parsed = new Date(value)
  if (isNaN(parsed.getTime())) {
    throw new AppError(422, 'INVALID_EVENT_DATE', 'La fecha de inicio indicada no es válida.')
  }
  return parsed
}

const createData = async (input: EventCreateInput): Promise<Prisma.EventUncheckedCreateInput> => {
  await Promise.all([verifyAuthor(input.createdById), verifyImage(input.imageId)])
  const startsAt = parseStartsAt(input.startsAt)
  const status = input.status ?? 'BORRADOR'
  return {
    createdById: input.createdById,
    imageId: input.imageId ?? null,
    name: cleanText(input.name),
    description: cleanText(input.description),
    startsAt,
    location: cleanText(input.location),
    maximumCapacity: input.maximumCapacity,
    additionalInformation: input.additionalInformation ? cleanText(input.additionalInformation) : null,
    status
  }
}

const buildUpdateData = (input: EventUpdateInput): Prisma.EventUncheckedUpdateInput => {
  const data: Prisma.EventUncheckedUpdateInput = {}

  if (input.imageId !== undefined) data.imageId = input.imageId
  if (input.name !== undefined) data.name = cleanText(input.name)
  if (input.description !== undefined) data.description = cleanText(input.description)
  if (input.startsAt !== undefined) data.startsAt = parseStartsAt(input.startsAt)
  if (input.location !== undefined) data.location = cleanText(input.location)
  if (input.maximumCapacity !== undefined) data.maximumCapacity = input.maximumCapacity
  if (input.additionalInformation !== undefined) {
    data.additionalInformation = input.additionalInformation ? cleanText(input.additionalInformation) : null
  }
  if (input.status !== undefined) data.status = input.status

  return data
}

const withAvailableCapacity = <T extends { id: number; maximumCapacity: number }>(
  event: T,
  confirmedCount: number
): T & { availableCapacity: number } => ({
  ...event,
  availableCapacity: Math.max(0, event.maximumCapacity - confirmedCount)
})

export const eventsService = {
  async publicList(query: EventPublicQuery) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const filters = {
      q: query.q ? cleanText(query.q) : undefined,
      page,
      pageSize
    }
    const [events, total] = await Promise.all([
      eventsRepository.publicList(filters),
      eventsRepository.publicCount(filters)
    ])

    if (events.length === 0) {
      return { items: [], pagination: { page, pageSize, total } }
    }

    const eventIds = events.map((e) => e.id)
    const countMap = await eventsRepository.countConfirmedByEventIds(eventIds)

    const items = events.map((event) =>
      withAvailableCapacity(event, countMap.get(event.id) ?? 0)
    )

    return { items, pagination: { page, pageSize, total } }
  },

  async publicById(id: number) {
    const event = await eventsRepository.findPublicById(id)
    if (!event) throw notFound()

    const countMap = await eventsRepository.countConfirmedByEventIds([id])
    return withAvailableCapacity(event, countMap.get(id) ?? 0)
  },

  async adminList(query: EventQuery) {
    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const filters = {
      q: query.q ? cleanText(query.q) : undefined,
      status: query.status,
      page,
      pageSize
    }
    const [items, total] = await Promise.all([
      eventsRepository.list(filters),
      eventsRepository.count(filters)
    ])
    return { items, pagination: { page, pageSize, total } }
  },

  async adminById(id: number) {
    const event = await eventsRepository.findById(id)
    if (!event) throw notFound()
    return event
  },

  async create(input: EventCreateInput) {
    return eventsRepository.create(await createData(input))
  },

  async update(id: number, input: EventUpdateInput) {
    const current = await eventsRepository.findById(id)
    if (!current) throw notFound()

    if (input.imageId !== undefined) {
      await verifyImage(input.imageId)
    }

    const data = buildUpdateData(input)

    if (input.maximumCapacity !== undefined) {
      return prisma.$transaction(async (tx) => {
        const locked = await eventRegistrationsRepository.lockEvent(tx, id)
        if (!locked) throw notFound()

        const confirmedCount = await eventRegistrationsRepository.countConfirmed(tx, id)
        if (input.maximumCapacity! < confirmedCount) {
          throw new AppError(
            422,
            'CAPACITY_BELOW_REGISTRATIONS',
            'La capacidad no puede ser menor al número de inscripciones confirmadas actuales.'
          )
        }

        return eventsRepository.update(id, data, tx)
      })
    }

    return eventsRepository.update(id, data)
  },

  async archive(id: number) {
    const current = await eventsRepository.findById(id)
    if (!current) throw notFound()
    return eventsRepository.update(id, { status: 'ARCHIVADO' })
  },

  async remove(id: number) {
    const current = await eventsRepository.findById(id)
    if (!current) throw notFound()

    const totalRegistrations = await eventsRepository.countRegistrations(id)
    if (totalRegistrations > 0) {
      throw new AppError(
        409,
        'EVENT_HAS_REGISTRATIONS',
        'No es posible eliminar un evento con inscripciones registradas. Debe cancelarse o archivarse.'
      )
    }

    return eventsRepository.remove(id)
  }
}
