import type { ContentStatus, Prisma } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

type Filters = { q?: string; status?: ContentStatus; publishedOnly?: boolean; page: number; pageSize: number }
const select = {
  id: true, imageId: true, title: true, slug: true, summary: true, content: true, status: true, createdAt: true, updatedAt: true, publishedAt: true,
  image: { select: { id: true, originalName: true, mimeType: true } }, createdBy: { select: { id: true, name: true } }
} satisfies Prisma.BlogPostSelect
const whereFor = ({ q, status, publishedOnly }: Filters): Prisma.BlogPostWhereInput => {
  const where: Prisma.BlogPostWhereInput = { ...(status ? { status } : {}), ...(publishedOnly ? { status: 'PUBLICADO', publishedAt: { lte: new Date() } } : {}) }
  if (q) where.OR = [{ title: { contains: q, mode: 'insensitive' } }, { summary: { contains: q, mode: 'insensitive' } }, { content: { contains: q, mode: 'insensitive' } }]
  return where
}
export const blogRepository = {
  list: ({ page, pageSize, ...filters }: Filters) => prisma.blogPost.findMany({ where: whereFor({ page, pageSize, ...filters }), select, orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
  count: ({ page, pageSize, ...filters }: Filters) => prisma.blogPost.count({ where: whereFor({ page, pageSize, ...filters }) }),
  byId: (id: number) => prisma.blogPost.findUnique({ where: { id }, select }),
  bySlug: (slug: string) => prisma.blogPost.findFirst({ where: { slug, ...whereFor({ page: 1, pageSize: 1, publishedOnly: true }) }, select }),
  create: (data: Prisma.BlogPostUncheckedCreateInput) => prisma.blogPost.create({ data, select }),
  update: (id: number, data: Prisma.BlogPostUncheckedUpdateInput) => prisma.blogPost.update({ where: { id }, data, select }),
  remove: (id: number) => prisma.blogPost.delete({ where: { id }, select }),
  activeUser: (id: number) => prisma.administrativeUser.findFirst({ where: { id, status: 'ACTIVO' }, select: { id: true } }),
  image: (id: number) => prisma.file.findUnique({ where: { id }, select: { id: true, mimeType: true } })
}
