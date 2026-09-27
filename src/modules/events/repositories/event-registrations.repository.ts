import type { EventRegistrationStatus, EventStatus, Prisma } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

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

export type EventRegistrationAdminFilters = {
  eventId: number
  status?: EventRegistrationStatus
  q?: string
  page: number
  pageSize: number
}

const adminSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  status: true,
  registeredAt: true
} satisfies Prisma.EventRegistrationSelect

const whereForAdmin = ({
  eventId,
  status,
  q
}: {
  eventId: number
  status?: EventRegistrationStatus
  q?: string
}): Prisma.EventRegistrationWhereInput => {
  const where: Prisma.EventRegistrationWhereInput = {
    eventId,
    ...(status ? { status } : {})
  }
  if (q) {
    where.OR = [
      { fullName: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } }
    ]
  }
  return where
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
  },

  adminList({ eventId, status, q, page, pageSize }: EventRegistrationAdminFilters) {
    return prisma.eventRegistration.findMany({
      where: whereForAdmin({ eventId, status, q }),
      select: adminSelect,
      orderBy: [{ registeredAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    })
  },

  adminCount({ eventId, status, q }: { eventId: number; status?: EventRegistrationStatus; q?: string }) {
    return prisma.eventRegistration.count({
      where: whereForAdmin({ eventId, status, q })
    })
  }
}
