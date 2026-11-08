import type { Prisma, ContentStatus } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

export const institutionalRepository = {
  listPublished: () => prisma.institutionalBlock.findMany({
    where: { status: 'PUBLICADO' },
    orderBy: [{ type: 'asc' }, { displayOrder: 'asc' }]
  }),

  listAll: () => prisma.institutionalBlock.findMany({
    orderBy: [{ type: 'asc' }, { displayOrder: 'asc' }]
  }),

  findById: (id: number) => prisma.institutionalBlock.findUnique({
    where: { id }
  }),

  countActiveAnnouncements: (excludeId?: number) => prisma.institutionalBlock.count({
    where: {
      type: { not: 'HERO' },
      status: 'PUBLICADO',
      ...(excludeId ? { id: { not: excludeId } } : {})
    }
  }),

  create: (data: Prisma.InstitutionalBlockCreateInput) => prisma.institutionalBlock.create({ data }),

  update: (id: number, data: Prisma.InstitutionalBlockUpdateInput) => prisma.institutionalBlock.update({
    where: { id },
    data
  }),

  archive: (id: number) => prisma.institutionalBlock.update({
    where: { id },
    data: { status: 'ARCHIVADO' satisfies ContentStatus }
  }),

  listFeatured: () => prisma.featuredItem.findMany({
    orderBy: { displayOrder: 'asc' },
    include: {
      news: {
        include: {
          category: true,
          image: { select: { id: true, originalName: true, mimeType: true } },
          createdBy: { select: { id: true, name: true } }
        }
      },
      event: {
        include: {
          image: { select: { id: true, originalName: true, mimeType: true } }
        }
      }
    }
  }),

  featuredNewsCandidates: (q: string) => prisma.news.findMany({
    where: {
      status: 'PUBLICADO',
      publishedAt: { lte: new Date() },
      category: { active: true },
      ...(q ? { title: { contains: q, mode: 'insensitive' } } : {})
    },
    select: { id: true, title: true, status: true, category: { select: { name: true } } },
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    take: q ? 10 : 4
  }),

  featuredEventCandidates: (q: string) => prisma.event.findMany({
    where: {
      status: 'PUBLICADO',
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {})
    },
    select: { id: true, name: true, location: true, status: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q ? 10 : 4
  }),

  findExistingNews: (ids: number[]) => prisma.news.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true }
  }),

  findExistingEvents: (ids: number[]) => prisma.event.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true }
  }),

  saveFeatured: (newsIds: number[], eventIds: number[]) => prisma.$transaction(async (tx) => {
    await tx.featuredItem.deleteMany()
    const records = [
      ...newsIds.map((newsId, index) => ({ newsId, displayOrder: index })),
      ...eventIds.map((eventId, index) => ({ eventId, displayOrder: index }))
    ]
    if (records.length > 0) {
      await tx.featuredItem.createMany({ data: records })
    }
    return { newsIds, eventIds }
  })
}
