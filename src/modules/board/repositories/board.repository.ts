import type { Prisma } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

export const boardRepository = {
  publicList: () => prisma.boardMember.findMany({ where: { status: 'ACTIVO' }, orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] }),
  adminList: () => prisma.boardMember.findMany({ orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }] }),
  create: (data: Prisma.BoardMemberCreateInput) => prisma.boardMember.create({ data }),
  update: (id: number, data: Prisma.BoardMemberUpdateInput) => prisma.boardMember.update({ where: { id }, data }),
  retire: (id: number) => prisma.boardMember.update({ where: { id }, data: { status: 'INACTIVO' } }),
  reorder: (items: { id: number; displayOrder: number }[]) => prisma.$transaction(items.map(item => prisma.boardMember.update({ where: { id: item.id }, data: { displayOrder: item.displayOrder } })))
}
