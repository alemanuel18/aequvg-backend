import { Prisma } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'
import { AppError } from '../../../shared/errors/app-error'
import { cleanText } from '../../../shared/utils/text'
import type { EventRegistrationAdminQuery, EventRegistrationBody } from '../dtos/registration-schemas'
import { eventRegistrationsRepository } from '../repositories/event-registrations.repository'
import { eventsRepository } from '../repositories/events.repository'

export const eventRegistrationsService = {
  async register(eventId: number, input: EventRegistrationBody) {
    if (input.website && input.website.trim().length > 0) {
      throw new AppError(400, 'INVALID_REQUEST', 'La solicitud no es válida.')
    }

    if (!input.consent) {
      throw new AppError(422, 'CONSENT_REQUIRED', 'Debes aceptar la política de privacidad.')
    }

    const fullName = cleanText(input.fullName)
    const email = input.email.trim().toLowerCase()
    const phone = cleanText(input.phone)
    const privacyVersion = cleanText(input.privacyVersion)

    if (!privacyVersion) {
      throw new AppError(422, 'INVALID_PRIVACY_VERSION', 'La versión de privacidad no es válida.')
    }

    if (fullName.length < 2) {
      throw new AppError(422, 'VALIDATION_ERROR', 'El nombre completo debe tener al menos 2 caracteres.')
    }

    if (phone.length < 7) {
      throw new AppError(422, 'VALIDATION_ERROR', 'El teléfono debe tener al menos 7 caracteres.')
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const event = await eventRegistrationsRepository.lockEvent(tx, eventId)
        if (!event) {
          throw new AppError(404, 'EVENT_NOT_FOUND', 'El evento solicitado no existe.')
        }

        if (event.status === 'BORRADOR' || event.status === 'ARCHIVADO') {
          throw new AppError(404, 'EVENT_NOT_FOUND', 'El evento solicitado no existe.')
        }

        if (event.status === 'CANCELADO' || event.status === 'FINALIZADO' || event.status !== 'PUBLICADO') {
          throw new AppError(422, 'EVENT_NOT_OPEN', 'El evento no está disponible para inscripciones.')
        }

        if (event.startsAt.getTime() <= Date.now()) {
          throw new AppError(422, 'EVENT_ALREADY_STARTED', 'El evento ya ha iniciado o ha concluido.')
        }

        const existing = await eventRegistrationsRepository.findExisting(tx, eventId, email)
        if (existing) {
          throw new AppError(
            409,
            'ALREADY_REGISTERED',
            'Ya existe una inscripción registrada con este correo electrónico para este evento.'
          )
        }

        const confirmedCount = await eventRegistrationsRepository.countConfirmed(tx, eventId)
        if (confirmedCount >= event.maximumCapacity) {
          throw new AppError(409, 'EVENT_FULL', 'El evento ha alcanzado su capacidad máxima.')
        }

        const registration = await eventRegistrationsRepository.create(tx, {
          eventId,
          fullName,
          email,
          phone,
          status: 'CONFIRMADA',
          consentedAt: new Date(),
          privacyVersion
        })

        return {
          id: registration.id,
          eventId: registration.eventId,
          status: registration.status,
          registeredAt: registration.registeredAt
        }
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(
          409,
          'ALREADY_REGISTERED',
          'Ya existe una inscripción registrada con este correo electrónico para este evento.'
        )
      }
      throw error
    }
  },

  async adminList(eventId: number, query: EventRegistrationAdminQuery) {
    const event = await eventsRepository.findById(eventId)
    if (!event) {
      throw new AppError(404, 'EVENT_NOT_FOUND', 'El evento solicitado no existe.')
    }

    const page = query.page ?? 1
    const pageSize = query.pageSize ?? 20
    const q = query.q ? cleanText(query.q) : undefined
    const status = query.status

    const filters = {
      eventId,
      status,
      q: q || undefined,
      page,
      pageSize
    }

    const [items, total] = await Promise.all([
      eventRegistrationsRepository.adminList(filters),
      eventRegistrationsRepository.adminCount({ eventId, status, q: q || undefined })
    ])

    return { items, pagination: { page, pageSize, total } }
  }
}
