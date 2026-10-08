import type { Prisma } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

export const contactRepository = {
  publicMethods: () => prisma.contactMethod.findMany({ where: { active: true }, orderBy: { displayOrder: 'asc' } }),
  allMethods: () => prisma.contactMethod.findMany({ orderBy: { displayOrder: 'asc' } }),
  primaryEmailMethod: () => prisma.contactMethod.findFirst({
    where: { active: true, type: 'EMAIL' },
    orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    select: { value: true }
  }),
  createMethod: (data: Prisma.ContactMethodCreateInput) => prisma.contactMethod.create({ data }),
  updateMethod: (id: number, data: Prisma.ContactMethodUpdateInput) => prisma.contactMethod.update({ where: { id }, data }),
  deactivateMethod: (id: number) => prisma.contactMethod.update({ where: { id }, data: { active: false } }),
}
