import type { EventStatus, Prisma } from '@prisma/client'
import { AppError } from '../../../shared/errors/app-error'
import { cleanText } from '../../../shared/utils/text'
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

const updateData = async (
  eventId: number,
  input: EventUpdateInput
): Promise<Prisma.EventUncheckedUpdateInput> => {
  if (input.imageId !== undefined) {
    await verifyImage(input.imageId)
  }

  if (input.maximumCapacity !== undefined) {
    const confirmedCount = await eventsRepository.countConfirmedRegistrations(eventId)
    if (input.maximumCapacity < confirmedCount) {
      throw new AppError(
        422,
        'CAPACITY_BELOW_REGISTRATIONS',
        'La capacidad no puede ser menor al número de inscripciones confirmadas actuales.'
      )
    }
  }

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

export const eventsService = {
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
    const data = await updateData(id, input)
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
