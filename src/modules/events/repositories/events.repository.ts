import type { EventStatus, Prisma } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

type EventFilters = { q?: string; status?: EventStatus; publishedOnly?: boolean; page: number; pageSize: number }

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

const publicSelect = {
  id: true,
  name: true,
  description: true,
  startsAt: true,
  location: true,
  maximumCapacity: true,
  additionalInformation: true,
  status: true,
  image: { select: { id: true, originalName: true, mimeType: true } }
} satisfies Prisma.EventSelect

const whereFor = ({ q, status, publishedOnly }: EventFilters): Prisma.EventWhereInput => {
  const where: Prisma.EventWhereInput = {
    ...(status ? { status } : {}),
    ...(publishedOnly ? { status: 'PUBLICADO' } : {})
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
  publicList: ({ page, pageSize, ...filters }: EventFilters) =>
    prisma.event.findMany({
      where: whereFor({ page, pageSize, publishedOnly: true, ...filters }),
      select: publicSelect,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
  publicCount: ({ page, pageSize, ...filters }: EventFilters) =>
    prisma.event.count({ where: whereFor({ page, pageSize, publishedOnly: true, ...filters }) }),
  findById: (id: number) => prisma.event.findUnique({ where: { id }, select }),
  findPublicById: (id: number) =>
    prisma.event.findFirst({
      where: { id, status: 'PUBLICADO' },
      select: publicSelect
    }),
  create: (data: Prisma.EventUncheckedCreateInput) => prisma.event.create({ data, select }),
  update: (
    id: number,
    data: Prisma.EventUncheckedUpdateInput,
    client: Prisma.TransactionClient | typeof prisma = prisma
  ) => client.event.update({ where: { id }, data, select }),
  remove: (id: number) => prisma.event.delete({ where: { id }, select }),
  findActiveUser: (id: number) => prisma.administrativeUser.findFirst({ where: { id, status: 'ACTIVO' }, select: { id: true } }),
  findImage: (id: number) => prisma.file.findUnique({ where: { id }, select: { id: true, mimeType: true } }),
  countRegistrations: (eventId: number) => prisma.eventRegistration.count({ where: { eventId } }),
  countConfirmedRegistrations: (eventId: number) =>
    prisma.eventRegistration.count({ where: { eventId, status: 'CONFIRMADA' } }),
  countConfirmedByEventIds: async (eventIds: number[]): Promise<Map<number, number>> => {
    if (eventIds.length === 0) return new Map()
    const groups = await prisma.eventRegistration.groupBy({
      by: ['eventId'],
      where: {
        eventId: { in: eventIds },
        status: 'CONFIRMADA'
      },
      _count: { _all: true }
    })
    return new Map(groups.map((g) => [g.eventId, g._count._all]))
  }
}
