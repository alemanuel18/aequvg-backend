import { prisma } from '../../../shared/database/prisma'

const studentAuthenticationInclude = { credential: true } as const

export const studentAuthRepository = {
  findUserByEmail: (email: string) => prisma.studentUser.findUnique({
    where: { email }, include: studentAuthenticationInclude
  }),

  findSession: (id: string) => prisma.studentSession.findUnique({
    where: { id }, include: { user: { include: studentAuthenticationInclude } }
  }),

  createUser: (data: { name: string; email: string; passwordHash: string }) => prisma.studentUser.create({
    data: {
      name: data.name,
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

  deleteAccountAndRevokeSessions: (userId: number) => prisma.$transaction(async tx => {
    await tx.studentUser.update({
      where: { id: userId },
      data: {
        status: 'ELIMINADO',
        deletedAt: new Date(),
        blockedUntil: null,
        reviewChannel: null
      }
    })
    await tx.studentSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: 'ACCOUNT_DELETED' }
    })
  })
}
