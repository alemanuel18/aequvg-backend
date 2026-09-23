import type { Prisma, ContentStatus } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

export const institutionalRepository = {
  listPublished: () => prisma.institutionalBlock.findMany({ where: { status: 'PUBLICADO' }, orderBy: [{ type: 'asc' }, { displayOrder: 'asc' }] }),
  listAll: () => prisma.institutionalBlock.findMany({ orderBy: [{ type: 'asc' }, { displayOrder: 'asc' }] }),
  create: (data: Prisma.InstitutionalBlockCreateInput) => prisma.institutionalBlock.create({ data }),
  update: (id: number, data: Prisma.InstitutionalBlockUpdateInput) => prisma.institutionalBlock.update({ where: { id }, data }),
  archive: (id: number) => prisma.institutionalBlock.update({ where: { id }, data: { status: 'ARCHIVADO' satisfies ContentStatus } })
}
