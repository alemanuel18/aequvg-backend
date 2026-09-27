import type { EventStatus, Prisma } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

type EventFilters = { q?: string; status?: EventStatus; page: number; pageSize: number }

const select = {
  id: true,
  createdById: true,
  imageId: true,
  name: true,
  description: true,
  startsAt: true,
  location: true,
  maximumCapacity: true,
  additionalInformation: true,
  status: true,
  createdAt: true,
  image: { select: { id: true, originalName: true, mimeType: true } },
  createdBy: { select: { id: true, name: true } }
} satisfies Prisma.EventSelect

const whereFor = ({ q, status }: EventFilters): Prisma.EventWhereInput => {
  const where: Prisma.EventWhereInput = {
    ...(status ? { status } : {})
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { location: { contains: q, mode: 'insensitive' } }
    ]
  }
  return where
}

export const eventsRepository = {
  list: ({ page, pageSize, ...filters }: EventFilters) =>
    prisma.event.findMany({
      where: whereFor({ page, pageSize, ...filters }),
      select,
      orderBy: [{ startsAt: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
  count: ({ page, pageSize, ...filters }: EventFilters) =>
    prisma.event.count({ where: whereFor({ page, pageSize, ...filters }) }),
  findById: (id: number) => prisma.event.findUnique({ where: { id }, select }),
  create: (data: Prisma.EventUncheckedCreateInput) => prisma.event.create({ data, select }),
  update: (id: number, data: Prisma.EventUncheckedUpdateInput) => prisma.event.update({ where: { id }, data, select }),
  remove: (id: number) => prisma.event.delete({ where: { id }, select }),
  findActiveUser: (id: number) => prisma.administrativeUser.findFirst({ where: { id, status: 'ACTIVO' }, select: { id: true } }),
  findImage: (id: number) => prisma.file.findUnique({ where: { id }, select: { id: true, mimeType: true } }),
  countRegistrations: (eventId: number) => prisma.eventRegistration.count({ where: { eventId } }),
  countConfirmedRegistrations: (eventId: number) =>
    prisma.eventRegistration.count({ where: { eventId, status: 'CONFIRMADA' } })
}
