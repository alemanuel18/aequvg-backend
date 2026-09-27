import type { EventStatus, Prisma } from '@prisma/client'

export type LockedEvent = {
  id: number
  status: EventStatus
  startsAt: Date
  maximumCapacity: number
}

type LockedEventRow = {
  id_evento: number
  estado: EventStatus
  inicia_en: Date
  capacidad_maxima: number
}

export const eventRegistrationsRepository = {
  async lockEvent(tx: Prisma.TransactionClient, eventId: number): Promise<LockedEvent | null> {
    const rows = await tx.$queryRaw<LockedEventRow[]>`
      SELECT id_evento, estado, inicia_en, capacidad_maxima
      FROM evento
      WHERE id_evento = ${eventId}
      FOR UPDATE
    `
    const row = rows[0]
    if (!row) return null
    return {
      id: row.id_evento,
      status: row.estado,
      startsAt: row.inicia_en,
      maximumCapacity: row.capacidad_maxima
    }
  },

  async findExisting(tx: Prisma.TransactionClient, eventId: number, email: string) {
    return tx.eventRegistration.findUnique({
      where: {
        eventId_email: { eventId, email }
      },
      select: {
        id: true,
        status: true
      }
    })
  },

  async countConfirmed(tx: Prisma.TransactionClient, eventId: number) {
    return tx.eventRegistration.count({
      where: {
        eventId,
        status: 'CONFIRMADA'
      }
    })
  },

  async create(tx: Prisma.TransactionClient, data: Prisma.EventRegistrationUncheckedCreateInput) {
    return tx.eventRegistration.create({
      data,
      select: {
        id: true,
        eventId: true,
        status: true,
        registeredAt: true
      }
    })
  }
}
