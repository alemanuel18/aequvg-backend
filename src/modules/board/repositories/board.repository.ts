import type { Prisma } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

const select = {
  id: true,
  photoId: true,
  name: true,
  position: true,
  description: true,
  institutionalEmail: true,
  term: true,
  termStartsAt: true,
  termEndsAt: true,
  displayOrder: true,
  status: true,
  photo: { select: { id: true, originalName: true, mimeType: true } }
} satisfies Prisma.BoardMemberSelect

export const boardRepository = {
  publicList: () => prisma.boardMember.findMany({ where: { status: 'ACTIVO' }, select, orderBy: [{ termStartsAt: 'desc' }, { term: 'desc' }, { displayOrder: 'asc' }, { name: 'asc' }] }),
  adminList: () => prisma.boardMember.findMany({ select, orderBy: [{ termStartsAt: 'desc' }, { term: 'desc' }, { displayOrder: 'asc' }, { name: 'asc' }] }),
  findById: (id: number) => prisma.boardMember.findUnique({ where: { id }, select: { id: true, displayOrder: true } }),
  findIds: (ids: number[]) => prisma.boardMember.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  create: (data: Prisma.BoardMemberUncheckedCreateInput) => prisma.boardMember.create({ data, select }),
  update: (id: number, data: Prisma.BoardMemberUncheckedUpdateInput) => prisma.boardMember.update({ where: { id }, data, select }),
  retire: (id: number) => prisma.boardMember.update({ where: { id }, data: { status: 'INACTIVO' }, select }),
  reorder: (items: { id: number; displayOrder: number }[]) => prisma.$transaction(items.map(item => prisma.boardMember.update({ where: { id: item.id }, data: { displayOrder: item.displayOrder }, select })))
}
