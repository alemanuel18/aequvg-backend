import type { ContentStatus, Prisma } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

type NewsFilters = { q?: string; categoryId?: number; status?: ContentStatus; publishedOnly?: boolean; page: number; pageSize: number }

const select = {
  id: true,
  categoryId: true,
  imageId: true,
  title: true,
  summary: true,
  content: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  publishedAt: true,
  category: { select: { id: true, name: true, active: true } },
  image: { select: { id: true, originalName: true, mimeType: true } },
  createdBy: { select: { id: true, name: true } }
} satisfies Prisma.NewsSelect

const whereFor = ({ q, categoryId, status, publishedOnly }: NewsFilters): Prisma.NewsWhereInput => {
  const where: Prisma.NewsWhereInput = {
    ...(categoryId ? { categoryId } : {}),
    ...(status ? { status } : {}),
    ...(publishedOnly ? { status: 'PUBLICADO', publishedAt: { lte: new Date() }, category: { active: true } } : {})
  }
  if (q) where.OR = [
    { title: { contains: q, mode: 'insensitive' } },
    { summary: { contains: q, mode: 'insensitive' } },
    { content: { contains: q, mode: 'insensitive' } },
    { category: { name: { contains: q, mode: 'insensitive' } } }
  ]
  return where
}

export const newsRepository = {
  list: ({ page, pageSize, ...filters }: NewsFilters) => prisma.news.findMany({ where: whereFor({ page, pageSize, ...filters }), select, orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
  count: ({ page, pageSize, ...filters }: NewsFilters) => prisma.news.count({ where: whereFor({ page, pageSize, ...filters }) }),
  findById: (id: number) => prisma.news.findUnique({ where: { id }, select }),
  findPublicById: (id: number) => prisma.news.findFirst({ where: { id, ...whereFor({ page: 1, pageSize: 1, publishedOnly: true }) }, select }),
  create: (data: Prisma.NewsUncheckedCreateInput) => prisma.news.create({ data, select }),
  update: (id: number, data: Prisma.NewsUncheckedUpdateInput) => prisma.news.update({ where: { id }, data, select }),
  remove: (id: number) => prisma.news.delete({ where: { id }, select }),
  activeCategories: () => prisma.newsCategory.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  findActiveCategory: (id: number) => prisma.newsCategory.findFirst({ where: { id, active: true }, select: { id: true } }),
  findActiveUser: (id: number) => prisma.administrativeUser.findFirst({ where: { id, status: 'ACTIVO' }, select: { id: true } }),
  findImage: (id: number) => prisma.file.findUnique({ where: { id }, select: { id: true, mimeType: true } })
}
