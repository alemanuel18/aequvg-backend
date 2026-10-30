import type { ContentStatus, Prisma } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

export type ResourceFilters = { q?: string; categoryId?: number; status?: ContentStatus; publishedOnly?: boolean; page: number; pageSize: number }

export const resourceSelect = {
  id: true,
  categoryId: true,
  fileId: true,
  title: true,
  description: true,
  status: true,
  createdAt: true,
  publishedAt: true,
  category: { select: { id: true, name: true, active: true } },
  file: { select: { id: true, originalName: true, mimeType: true } },
  links: { select: { id: true, label: true, url: true, displayOrder: true }, orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }] },
  createdBy: { select: { id: true, name: true } }
} satisfies Prisma.ResourceSelect

const whereFor = ({ q, categoryId, status, publishedOnly }: ResourceFilters): Prisma.ResourceWhereInput => {
  const where: Prisma.ResourceWhereInput = {
    ...(categoryId ? { categoryId } : {}),
    ...(status ? { status } : {}),
    ...(publishedOnly ? { status: 'PUBLICADO', publishedAt: { lte: new Date() }, category: { active: true } } : {})
  }
  if (q) where.OR = [
    { title: { contains: q, mode: 'insensitive' } },
    { description: { contains: q, mode: 'insensitive' } },
    { category: { name: { contains: q, mode: 'insensitive' } } },
    { links: { some: { OR: [{ label: { contains: q, mode: 'insensitive' } }, { url: { contains: q, mode: 'insensitive' } }] } } }
  ]
  return where
}

export const resourceRepository = {
  list: ({ page, pageSize, ...filters }: ResourceFilters) => prisma.resource.findMany({ where: whereFor({ page, pageSize, ...filters }), select: resourceSelect, orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
  count: ({ page, pageSize, ...filters }: ResourceFilters) => prisma.resource.count({ where: whereFor({ page, pageSize, ...filters }) }),
  findById: (id: number) => prisma.resource.findUnique({ where: { id }, select: resourceSelect }),
  findPublicById: (id: number) => prisma.resource.findFirst({ where: { id, ...whereFor({ page: 1, pageSize: 1, publishedOnly: true }) }, select: resourceSelect }),
  create: (data: Prisma.ResourceCreateInput) => prisma.resource.create({ data, select: resourceSelect }),
  update: (id: number, data: Prisma.ResourceUpdateInput) => prisma.resource.update({ where: { id }, data, select: resourceSelect }),
  remove: (id: number) => prisma.resource.delete({ where: { id }, select: resourceSelect }),
  activeCategories: () => prisma.resourceCategory.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  findActiveCategory: (id: number) => prisma.resourceCategory.findFirst({ where: { id, active: true }, select: { id: true } }),
  findActiveUser: (id: number) => prisma.administrativeUser.findFirst({ where: { id, status: 'ACTIVO' }, select: { id: true } }),
  findFile: (id: number) => prisma.file.findUnique({ where: { id }, select: { id: true, mimeType: true, storageKey: true, sizeBytes: true } }),
  findPublicFile: (id: number) => prisma.resource.findFirst({
    where: { id, status: 'PUBLICADO', publishedAt: { lte: new Date() }, category: { active: true } },
    select: { file: { select: { originalName: true, mimeType: true, storageKey: true } } }
  })
}
