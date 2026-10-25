import { prisma } from '../../../shared/database/prisma'

const studentAccountWhere = { isStudent: true, email: { endsWith: '@uvg.edu.gt', mode: 'insensitive' as const } }

const studentAuthenticationInclude = { credential: true } as const

export const studentAuthRepository = {
  findUserByEmail: (email: string) => prisma.studentUser.findUnique({
    where: { email }, include: studentAuthenticationInclude
  }),

  findUserById: (id: number) => prisma.studentUser.findUnique({
    where: { id }, include: studentAuthenticationInclude
  }),

  listManagedAccounts: async ({ q, status, page, pageSize }: { q?: string; status?: string; page: number; pageSize: number }) => {
    const where = {
      ...studentAccountWhere,
      ...(status ? { status: status as 'ACTIVO' | 'BLOQUEADO_TEMPORAL' | 'BLOQUEADO_PERMANENTE' | 'ELIMINADO' } : {}),
      ...(q ? { OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { email: { contains: q, mode: 'insensitive' as const } }
      ] } : {})
    }
    const [items, total] = await prisma.$transaction([
      prisma.studentUser.findMany({ where, select: { id: true, name: true, firstNames: true, lastNames: true, email: true, status: true, blockedUntil: true, reviewChannel: true, deletedAt: true, createdAt: true, updatedAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.studentUser.count({ where })
    ])
    return { items, total }
  },

  findManagedAccount: (id: number) => prisma.studentUser.findFirst({
    where: { id, ...studentAccountWhere },
    select: {
      id: true, name: true, firstNames: true, lastNames: true, email: true, isStudent: true,
      status: true, blockedUntil: true, reviewChannel: true, deletedAt: true, createdAt: true, updatedAt: true,
      statusHistory: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          id: true, fromStatus: true, toStatus: true, reason: true, blockedUntil: true, reviewChannel: true, createdAt: true,
          actor: { select: { id: true, name: true } }
        }
      }
    }
  }),

  updateProfile: (id: number, data: { name: string; firstNames: string; lastNames: string }) => prisma.studentUser.update({
    where: { id }, data, include: studentAuthenticationInclude
  }),

  findSession: (id: string) => prisma.studentSession.findUnique({
    where: { id }, include: { user: { include: studentAuthenticationInclude } }
  }),

  createUser: (data: { name: string; firstNames: string; lastNames: string; email: string; passwordHash: string }) => prisma.studentUser.create({
    data: {
      name: data.name,
      firstNames: data.firstNames,
      lastNames: data.lastNames,
      email: data.email,
      isStudent: true,
      credential: { create: { passwordHash: data.passwordHash } }
    },
    include: studentAuthenticationInclude
  }),

  createSession: (data: {
    id: string
    userId: number
    tokenIdentifierHash: string
    deviceSecretHash: string
    browserContextHash: string
    csrfTokenHash: string
    expiresAt: Date
  }) => prisma.studentSession.create({ data }),

  touchSession: (id: string) => prisma.studentSession.update({
    where: { id }, data: { lastSeenAt: new Date() }
  }),

  revokeSession: (id: string, reason: string) => prisma.studentSession.updateMany({
    where: { id, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: reason }
  }),

  activateExpiredTemporaryBlock: (userId: number) => prisma.studentUser.update({
    where: { id: userId },
    data: { status: 'ACTIVO', blockedUntil: null, reviewChannel: null },
    include: studentAuthenticationInclude
  }),

  updateStatusAndRevokeSessions: (userId: number, data: {
    status: 'ACTIVO' | 'BLOQUEADO_TEMPORAL' | 'BLOQUEADO_PERMANENTE'
    blockedUntil: Date | null
    reviewChannel: string | null
    actorId: number
    reason: string
  }) => prisma.$transaction(async tx => {
    const current = await tx.studentUser.findFirst({ where: { id: userId, ...studentAccountWhere } })
    if (!current) return null
    if (current.status === 'ELIMINADO') return { user: current, changed: false, deleted: true as const }
    const user = await tx.studentUser.update({
      where: { id: userId }, data: { status: data.status, blockedUntil: data.blockedUntil, reviewChannel: data.reviewChannel }, include: studentAuthenticationInclude
    })
    const changed = current.status !== data.status || current.blockedUntil?.getTime() !== data.blockedUntil?.getTime() || current.reviewChannel !== data.reviewChannel
    if (changed) await tx.studentAccountStatusHistory.create({ data: {
      studentId: userId, actorId: data.actorId, fromStatus: current.status, toStatus: data.status,
      reason: data.reason, blockedUntil: data.blockedUntil, reviewChannel: data.reviewChannel
    } })
    if (data.status !== 'ACTIVO') await tx.studentSession.updateMany({
      where: { userId, revokedAt: null }, data: { revokedAt: new Date(), revocationReason: 'ACCOUNT_STATUS_CHANGED' }
    })
    return { user, changed, deleted: false as const }
  }),

  deleteAccountAndRevokeSessions: (userId: number, data: { actorId: number | null; reason: string }) => prisma.$transaction(async tx => {
    const current = await tx.studentUser.findFirst({ where: { id: userId, ...studentAccountWhere } })
    if (!current) return null
    if (current.status === 'ELIMINADO') return { alreadyDeleted: true as const }
    const deletedAt = new Date()
    const user = await tx.studentUser.update({
      where: { id: userId },
      data: {
        status: 'ELIMINADO',
        deletedAt,
        blockedUntil: null,
        reviewChannel: null
      }
    })
    await tx.studentAccountStatusHistory.create({ data: {
      studentId: userId, actorId: data.actorId, fromStatus: current.status, toStatus: 'ELIMINADO',
      reason: data.reason, blockedUntil: null, reviewChannel: null
    } })
    await tx.studentSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: 'ACCOUNT_DELETED' }
    })
    return { alreadyDeleted: false as const, user }
  })
}
