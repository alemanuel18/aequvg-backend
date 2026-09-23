import type { Prisma } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

export const contactRepository = {
  publicMethods: () => prisma.contactMethod.findMany({ where: { active: true }, orderBy: { displayOrder: 'asc' } }),
  allMethods: () => prisma.contactMethod.findMany({ orderBy: { displayOrder: 'asc' } }),
  createMethod: (data: Prisma.ContactMethodCreateInput) => prisma.contactMethod.create({ data }),
  updateMethod: (id: number, data: Prisma.ContactMethodUpdateInput) => prisma.contactMethod.update({ where: { id }, data }),
  deactivateMethod: (id: number) => prisma.contactMethod.update({ where: { id }, data: { active: false } }),
  createRequest: (data: Prisma.ContactRequestCreateInput) => prisma.contactRequest.create({ data, select: { id: true, status: true, sentAt: true } }),
  listRequests: (skip: number, take: number) => prisma.contactRequest.findMany({ skip, take, orderBy: { sentAt: 'desc' } }),
  countRequests: () => prisma.contactRequest.count(),
  updateRequest: (id: number, data: Prisma.ContactRequestUpdateInput) => prisma.contactRequest.update({ where: { id }, data })
}
