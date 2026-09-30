import type { AdministrativeUserStatus } from '@prisma/client'
import { prisma } from '../../../shared/database/prisma'

const publicInclude = {
  role: { include: { permissions: { include: { permission: true } } } },
  identities: { select: { provider: true } },
  credential: { select: { userId: true } }
} as const

export const usersRepository = {
  list: () => prisma.administrativeUser.findMany({ include: publicInclude, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
  findById: (id: number) => prisma.administrativeUser.findUnique({ where: { id }, include: publicInclude }),
  findRole: (id: number) => prisma.role.findUnique({ where: { id }, include: { permissions: { include: { permission: true } } } }),
  listRoles: () => prisma.role.findMany({
    where: { active: true },
    include: { permissions: { include: { permission: true } } },
    orderBy: { name: 'asc' }
  }),
  create: (data: { name: string; email: string; roleId: number; passwordHash?: string }) => prisma.$transaction(async tx => {
    const user = await tx.administrativeUser.create({
      data: { name: data.name, email: data.email, roleId: data.roleId }
    })
    if (data.passwordHash) await tx.administrativeCredential.create({ data: { userId: user.id, passwordHash: data.passwordHash } })
    return tx.administrativeUser.findUniqueOrThrow({ where: { id: user.id }, include: publicInclude })
  }),
  update: (id: number, data: { name?: string; roleId?: number; status?: AdministrativeUserStatus }) => prisma.administrativeUser.update({
    where: { id }, data, include: publicInclude
  }),
  setPassword: (id: number, passwordHash: string) => prisma.administrativeCredential.upsert({
    where: { userId: id }, update: { passwordHash }, create: { userId: id, passwordHash }
  })
}
